import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { RaycastVehicle } from './vehicle/RaycastVehicle';
import { TruckModel } from './vehicle/TruckModel';
import { GLTFTruckModel } from './vehicle/GLTFTruckModel';
import { ForestStageMap } from './world/ForestStageMap';
import { FollowCamera } from './camera/FollowCamera';
import { InputManager } from './input/InputManager';
import { RallyEngineAudio } from './audio/RallyEngineAudio';
import { AudioManager } from './audio/AudioManager';
import { DustParticleSystem } from './effects/DustParticles';
import { Atmosphere } from './effects/Atmosphere';
import { PostProcessingManager } from './effects/PostProcessing';
import { StageTimer } from './gameplay/StageTimer';
import { FuelSystem } from './gameplay/FuelSystem';

// Pre-allocated reusable scratch vectors to eliminate garbage-collection churn
const _truckVel = new THREE.Vector3();
const _chassisQuat = new THREE.Quaternion();
const _vRight = new THREE.Vector3();
const _truckPos = new THREE.Vector3();
const _landPos = new THREE.Vector3();

class Game {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private cameraController!: FollowCamera;
  private postProcessing!: PostProcessingManager;
  private physics!: PhysicsWorld;
  private vehicle!: RaycastVehicle;
  private truckModel!: TruckModel;
  private gltfTruckModel!: GLTFTruckModel;
  private useGLTF: boolean = true;
  private forestMap!: ForestStageMap;
  private atmosphere!: Atmosphere;
  private input!: InputManager;
  private rallyAudio!: RallyEngineAudio;
  private audio!: AudioManager;
  private dust!: DustParticleSystem;
  private stageTimer!: StageTimer;
  private fuelSystem!: FuelSystem;
  private clock: THREE.Clock = new THREE.Clock();

  private wasAirborne: boolean = false;
  private dustEmitAccumulator: number = 0;

  // UI Elements
  private speedEl = document.getElementById('speed-val');
  private airtimeEl = document.getElementById('airtime-val');
  private gearEl = document.getElementById('gear-val');
  private camLabelEl = document.getElementById('cam-label');
  private hbBadgeEl = document.getElementById('hb-badge');
  private btnSound = document.getElementById('btn-sound');
  private soundLabelEl = document.getElementById('sound-label');

  public async init() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    // 1. Three.js Renderer Setup (Capped pixel ratio for low VRAM and flat memory footprint)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // 2. Scene & Atmosphere (Physically-based Nishita Sky, IBL Reflections & Lighting)
    this.scene = new THREE.Scene();
    this.atmosphere = new Atmosphere(this.scene, this.renderer);

    // 3. Initialize Camera & Input
    this.cameraController = new FollowCamera(window.innerWidth / window.innerHeight);
    this.input = new InputManager();

    // 4. Initialize Post-Processing (Bloom, SSAO, Cinematic Film Grading & Vignette)
    this.postProcessing = new PostProcessingManager(this.renderer, this.scene, this.cameraController.camera);

    // 4. Initialize Audio & Particle Systems
    this.rallyAudio = new RallyEngineAudio();
    this.audio = new AudioManager();
    this.dust = new DustParticleSystem();
    this.scene.add(this.dust.group);

    // 5. Initialize Stage Timer & Fuel System
    this.stageTimer = new StageTimer();
    this.fuelSystem = new FuelSystem();

    // 6. Initialize Physics
    this.physics = await PhysicsWorld.create();

    // 7. Build Lush Pine Forest Off-Road Map & Petrol Stations
    this.forestMap = new ForestStageMap(this.physics.rapier, this.physics.world);
    this.scene.add(this.forestMap.mesh);

    // Staging position at the rally start line facing north into the pine forest tunnel
    const startY = this.forestMap.getTerrainHeight(0, 12) + 1.35;
    const spawnPos = new THREE.Vector3(0, startY, 12);
    this.vehicle = new RaycastVehicle(this.physics.rapier, this.physics.world, spawnPos);

    // Hero 6x6 Off-Road Visual Rig
    this.truckModel = new TruckModel();
    this.truckModel.group.visible = false; // Hide primitive box truck
    this.gltfTruckModel = new GLTFTruckModel();
    this.scene.add(this.truckModel.group);
    this.scene.add(this.gltfTruckModel.group);

    // Await authentic 3D Truck Model before starting so it renders on frame 1
    const loaded = await this.gltfTruckModel.loadModel('/assets/models/dakar_truck.glb');
    if (loaded) {
      this.useGLTF = true;
      this.gltfTruckModel.group.visible = true;
    } else {
      this.truckModel.group.visible = true;
    }

    // Setup Sound Toggle UI
    this.setupAudioUI();

    // Setup Tab Focus / Visibility Handler
    this.setupVisibilityHandler();

    // Resize listener
    window.addEventListener('resize', () => this.onResize());

    // Start Game Loop
    this.clock.start();
    this.animate();
  }

  private setupAudioUI() {
    const updateSoundLabel = () => {
      if (this.soundLabelEl) {
        this.soundLabelEl.textContent = this.rallyAudio.isMuted ? 'Muted' : 'Sound ON';
      }
    };

    updateSoundLabel();

    this.btnSound?.addEventListener('click', (e) => {
      e.preventDefault();
      this.rallyAudio.init();
      this.rallyAudio.toggleMute();
      this.audio.toggleMute();
      updateSoundLabel();
    });
  }

  private setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clock.stop();
      } else {
        this.clock.start();
      }
    });
  }

  private onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    this.cameraController.handleResize(width / height);
    this.postProcessing.setSize(width, height);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);

    const rawDelta = this.clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);

    // Get input
    const inputState = this.input.getInput();

    // Handle Camera Toggle
    if (inputState.cameraToggleRequested) {
      const modeName = this.cameraController.toggleMode();
      if (this.camLabelEl) this.camLabelEl.textContent = modeName;
    }

    // Step Physics Simulation (Substeps for high stability with surface physics)
    const substeps = 2;
    const subDt = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      this.vehicle.update(subDt, inputState, (x, z) => this.forestMap.getSurfaceAt(x, z));
      this.physics.step();
    }

    // Determine Braking state for brake lights
    const isBraking = inputState.handbrake || (inputState.throttle < 0 && this.vehicle.speedKmh > 1.2);

    // Update active 3D Truck Model (GLTF 6x6 or Dakar Tsar)
    if (this.useGLTF && this.gltfTruckModel.isLoaded) {
      this.gltfTruckModel.update(this.vehicle, isBraking);
    } else {
      this.truckModel.update(this.vehicle, isBraking);
    }

    // Zero-allocation telemetry vectors
    const chassisLinVel = this.vehicle.chassisBody.linvel();
    _truckVel.set(chassisLinVel.x, chassisLinVel.y, chassisLinVel.z);
    const chassisRot = this.vehicle.chassisBody.rotation();
    _chassisQuat.set(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);
    _vRight.set(1, 0, 0).applyQuaternion(_chassisQuat);
    const lateralSlipSpeed = _truckVel.dot(_vRight);

    // Update Audio Systems with Vehicle Telemetry
    this.rallyAudio.update(dt, this.vehicle.speedKmh, inputState.throttle);

    // Keep tire skids, landings, and wind rush from AudioManager
    this.audio.setEngineVolume(0.0);
    this.audio.update(
      dt,
      this.vehicle.speedKmh,
      inputState.throttle,
      this.vehicle.isAirborne,
      this.vehicle.isHandbraking,
      lateralSlipSpeed
    );

    // Fuel & Petrol Station Proximity Check
    const trans = this.vehicle.chassisBody.translation();
    _truckPos.set(trans.x, trans.y, trans.z);

    let isNearPump = false;
    for (const st of this.forestMap.gasStations) {
      if (st.pos.distanceTo(_truckPos) < st.radius) {
        isNearPump = true;
        break;
      }
    }

    const powerMult = this.fuelSystem.update(dt, inputState.throttle, this.vehicle.speedKmh, isNearPump);
    this.vehicle.powerMultiplier = powerMult;

    if (inputState.resetRequested && this.fuelSystem.isOutOfFuel) {
      this.fuelSystem.refuelFull();
    }

    // Dynamic Sunlight & Ghibli Sky & Cloud Animation
    this.atmosphere.update(dt, _truckPos);

    // Stage Timing System
    if (this.vehicle.speedKmh > 3.0 && !this.stageTimer.isRunning && !this.stageTimer.stageCompleted) {
      this.stageTimer.start();
    }
    this.stageTimer.update(dt);

    // Heavy Landing Effects (Audio & Dust Burst)
    if (this.wasAirborne && !this.vehicle.isAirborne) {
      _landPos.set(trans.x, trans.y - 1.0, trans.z);
      this.dust.emitLandingBurst(_landPos, Math.max(1.0, this.vehicle.speedKmh / 50.0));
    }
    this.wasAirborne = this.vehicle.isAirborne;

    // Dust from Driving Wheels
    this.dustEmitAccumulator += dt;
    if (this.dustEmitAccumulator > 0.04) {
      this.dustEmitAccumulator = 0;
      if (!this.vehicle.isAirborne && this.vehicle.speedKmh > 4.0) {
        for (let i = 0; i < this.vehicle.wheels.length; i++) {
          const w = this.vehicle.wheels[i];
          if (w.inContact) {
            const intensity = (this.vehicle.speedKmh / 80.0) + (this.vehicle.isHandbraking ? 1.0 : 0.0);
            this.dust.emitWheelDust(w.worldPosition, _truckVel, intensity, w.surfaceType);
          }
        }
      }

      // Diesel exhaust soot from dual chrome stacks under throttle
      if (inputState.throttle > 0.08) {
        const tips = this.truckModel.getExhaustWorldPositions();
        this.dust.emitExhaustSmoke(tips.left, _truckVel, inputState.throttle);
        this.dust.emitExhaustSmoke(tips.right, _truckVel, inputState.throttle);
      }
    }
    this.dust.update(dt);

    // Update Follow Camera
    this.cameraController.update(dt, this.vehicle);

    // Update HUD Telemetry
    this.updateHUD(inputState.throttle);

    // Render Scene with Cinematic Post-Processing Pipeline
    this.postProcessing.render();
  };

  private updateHUD(throttleInput: number) {
    if (this.speedEl) {
      this.speedEl.textContent = Math.round(this.vehicle.speedKmh).toString();
    }

    if (this.airtimeEl) {
      if (this.vehicle.isAirborne) {
        this.airtimeEl.textContent = `${this.vehicle.airtime.toFixed(1)}s`;
        this.airtimeEl.style.color = '#ff9800';
      } else {
        this.airtimeEl.textContent = '0.0s';
        this.airtimeEl.style.color = '#eee';
      }
    }

    if (this.hbBadgeEl) {
      if (this.vehicle.isHandbraking) {
        this.hbBadgeEl.classList.add('visible');
      } else {
        this.hbBadgeEl.classList.remove('visible');
      }
    }

    if (this.gearEl) {
      if (throttleInput < -0.1 && this.vehicle.speedKmh > 1.0) {
        this.gearEl.textContent = 'R';
      } else {
        const spd = this.vehicle.speedKmh;
        if (spd < 18) this.gearEl.textContent = '1';
        else if (spd < 38) this.gearEl.textContent = '2';
        else if (spd < 62) this.gearEl.textContent = '3';
        else if (spd < 92) this.gearEl.textContent = '4';
        else if (spd < 122) this.gearEl.textContent = '5';
        else this.gearEl.textContent = '6';
      }
    }
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', async () => {
  const game = new Game();
  await game.init();
});

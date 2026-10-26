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
import { StageTimer } from './gameplay/StageTimer';
import { FuelSystem } from './gameplay/FuelSystem';

class Game {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private cameraController!: FollowCamera;
  private physics!: PhysicsWorld;
  private vehicle!: RaycastVehicle;
  private fallbackTruckModel!: TruckModel;
  private gltfTruckModel!: GLTFTruckModel;
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

    // 1. Three.js Renderer Setup
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // 2. Scene & Atmosphere (Physically-based Nishita Sky & Lighting)
    this.scene = new THREE.Scene();
    this.atmosphere = new Atmosphere(this.scene);

    // 3. Initialize Camera & Input
    this.cameraController = new FollowCamera(window.innerWidth / window.innerHeight);
    this.input = new InputManager();

    // 4. Initialize Audio & Particle Systems
    this.rallyAudio = new RallyEngineAudio();
    this.audio = new AudioManager();
    this.dust = new DustParticleSystem();
    this.scene.add(this.dust.mesh);

    // 5. Initialize Stage Timer & Fuel System
    this.stageTimer = new StageTimer();
    this.fuelSystem = new FuelSystem();

    // 6. Initialize Physics
    this.physics = await PhysicsWorld.create();

    // 7. Build Lush Pine Forest Off-Road Map & Petrol Stations
    this.forestMap = new ForestStageMap(this.physics.rapier, this.physics.world);
    this.scene.add(this.forestMap.mesh);

    // Staging position at the forest trailhead
    const spawnPos = new THREE.Vector3(0, 3.5, 0);
    this.vehicle = new RaycastVehicle(this.physics.rapier, this.physics.world, spawnPos);

    this.fallbackTruckModel = new TruckModel();
    this.gltfTruckModel = new GLTFTruckModel();
    this.scene.add(this.gltfTruckModel.group);
    this.scene.add(this.fallbackTruckModel.group);

    // Load 6x6 Heavy Truck Model
    this.gltfTruckModel.loadModel('/assets/models/dakar_truck.glb').then((loaded) => {
      if (loaded) {
        this.fallbackTruckModel.group.visible = false;
      }
    });

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.cameraController.handleResize(width / height);
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

    // Step Physics Simulation (Substeps for high stability)
    const substeps = 2;
    const subDt = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      this.vehicle.update(subDt, inputState);
      this.physics.step();
    }

    // Determine Braking state for brake lights
    const isBraking = inputState.handbrake || (inputState.throttle < 0 && this.vehicle.speedKmh > 1.2);

    // Update 3D Visual Mesh & Suspension
    if (this.gltfTruckModel.isLoaded) {
      this.gltfTruckModel.update(this.vehicle, isBraking);
    } else {
      this.fallbackTruckModel.update(this.vehicle, isBraking);
    }

    // Calculate lateral slip for tire sounds & particles
    const chassisLinVel = this.vehicle.chassisBody.linvel();
    const truckVel = new THREE.Vector3(chassisLinVel.x, chassisLinVel.y, chassisLinVel.z);
    const chassisRot = this.vehicle.chassisBody.rotation();
    const chassisQuat = new THREE.Quaternion(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);
    const vRight = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisQuat);
    const lateralSlipSpeed = truckVel.dot(vRight);

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
    const truckPos = new THREE.Vector3(trans.x, trans.y, trans.z);

    let isNearPump = false;
    for (const st of this.forestMap.gasStations) {
      if (st.pos.distanceTo(truckPos) < st.radius) {
        isNearPump = true;
        break;
      }
    }

    const powerMult = this.fuelSystem.update(dt, inputState.throttle, this.vehicle.speedKmh, isNearPump);
    this.vehicle.powerMultiplier = powerMult;

    if (inputState.resetRequested && this.fuelSystem.isOutOfFuel) {
      this.fuelSystem.refuelFull();
    }

    // Dynamic Sunlight Follows Vehicle
    this.atmosphere.updateLightTarget(truckPos);

    // Stage Timing System
    if (this.vehicle.speedKmh > 3.0 && !this.stageTimer.isRunning && !this.stageTimer.stageCompleted) {
      this.stageTimer.start();
    }
    this.stageTimer.update(dt);

    // Heavy Landing Effects (Audio & Dust Burst)
    if (this.wasAirborne && !this.vehicle.isAirborne) {
      const trans = this.vehicle.chassisBody.translation();
      const landPos = new THREE.Vector3(trans.x, trans.y - 1.0, trans.z);
      this.dust.emitLandingBurst(landPos, Math.max(1.0, this.vehicle.speedKmh / 50.0));
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
            this.dust.emitWheelDust(w.worldPosition, truckVel, intensity);
          }
        }
      }
    }
    this.dust.update(dt);

    // Update Follow Camera
    this.cameraController.update(dt, this.vehicle);

    // Update HUD Telemetry
    this.updateHUD(inputState.throttle);

    // Render Scene
    this.renderer.render(this.scene, this.cameraController.camera);
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

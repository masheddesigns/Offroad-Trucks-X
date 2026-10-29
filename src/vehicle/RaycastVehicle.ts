import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { VehicleInput } from '../input/InputManager';
import { SurfaceInfo } from '../world/ForestStageMap';

export interface WheelConfig {
  localMountPoint: THREE.Vector3;
  radius: number;
  suspensionRestLength: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  maxTravel: number;
  isFront: boolean;
  isDrive: boolean;
}

export interface WheelState {
  config: WheelConfig;
  inContact: boolean;
  hitDistance: number;
  compression: number;
  suspensionLength: number;
  steerAngle: number;
  rotationAngle: number;
  worldPosition: THREE.Vector3;
  worldRotation: THREE.Quaternion;
  surfaceType?: string;
}

// Pre-allocated static scratch objects to guarantee ZERO garbage-collection churn during physics
const _chPos = new THREE.Vector3();
const _chQuat = new THREE.Quaternion();
const _linVel = new THREE.Vector3();
const _angVel = new THREE.Vector3();
const _vFwd = new THREE.Vector3();
const _vUp = new THREE.Vector3();
const _vRight = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _hardpoint = new THREE.Vector3();
const _rContact = new THREE.Vector3();
const _pointVel = new THREE.Vector3();
const _angCross = new THREE.Vector3();
const _suspImpulse = new THREE.Vector3();
const _wheelSteerQuat = new THREE.Quaternion();
const _wheelLocalQuat = new THREE.Quaternion();
const _wheelFwd = new THREE.Vector3();
const _wheelRight = new THREE.Vector3();
const _driveImpulse = new THREE.Vector3();
const _dragImpulse = new THREE.Vector3();
const _brakeImpulse = new THREE.Vector3();
const _latImpulse = new THREE.Vector3();
const _antiRollImpulseL = new THREE.Vector3();
const _antiRollImpulseR = new THREE.Vector3();
const _parkImpulse = new THREE.Vector3();
const _rollCorrectionAxis = new THREE.Vector3();
const _rollDampTorque = new THREE.Vector3();
const _rightingTorque = new THREE.Vector3();
const _rightingImpulse = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _worldUp = new THREE.Vector3(0, 1, 0);

export class RaycastVehicle {
  public chassisBody: RAPIER.RigidBody;
  public chassisCollider: RAPIER.Collider;
  public wheels: WheelState[] = [];

  // Handling and Dakar Rally Tuning
  public maxSteerAngle: number = 0.58; // ~33 degrees
  public steerSpeed: number = 4.2;
  public currentSteer: number = 0.0;
  public engineHorsepower: number = 72000.0; // Scaled for 7.5-ton 6x6 rally raid truck
  public brakeForce: number = 48000.0;
  public lateralGrip: number = 0.95;
  public antiRollStiffness: number = 22000.0;
  public powerMultiplier: number = 1.0; // Scaled by fuel system

  // Telemetry
  public speedKmh: number = 0.0;
  public airtime: number = 0.0;
  public isAirborne: boolean = false;
  public isHandbraking: boolean = false;

  private rapier: typeof RAPIER;
  private world: RAPIER.World;

  constructor(
    rapier: typeof RAPIER,
    world: RAPIER.World,
    initialPos: THREE.Vector3 = new THREE.Vector3(0, 1.35, 0)
  ) {
    this.rapier = rapier;
    this.world = world;

    // 1. Heavy Truck Chassis Rigid Body (7,500 kg Dakar Ladder Frame)
    const bodyDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(initialPos.x, initialPos.y, initialPos.z)
      .setRotation({ x: 0, y: 1, z: 0, w: 0 }) // Face North toward WP1 down the pine tree corridor
      .setLinearDamping(0.14)
      .setAngularDamping(1.5)
      .setCanSleep(false);

    this.chassisBody = world.createRigidBody(bodyDesc);

    // 2. Chassis Collider: Beveled / Rounded Dakar Underbody with High Approach Angle & Skid Plate
    const colliderDesc = rapier.ColliderDesc.roundCuboid(1.18, 0.62, 2.95, 0.16)
      .setTranslation(0.0, 0.16, -0.05)
      .setDensity(1.0)
      .setFriction(0.12) // Low-friction Duralumin rally skid plate prevents snagging on terrain
      .setRestitution(0.02);

    this.chassisCollider = world.createCollider(colliderDesc, this.chassisBody);

    // Low Center of Mass for Authentic Off-Road Stability (8,200 kg Dakar Rally Raid)
    this.chassisCollider.setMassProperties(
      8200.0, // 8.2 metric tons
      { x: 0, y: -0.55, z: -0.10 },
      { x: 28000, y: 32000, z: 20000 },
      { x: 0, y: 0, z: 0, w: 1 }
    );
    this.chassisBody.recomputeMassPropertiesFromColliders();

    // 3. Define 4 Physical Wheels for the 4x4 MAZ-6440RR Dakar Setup
    const trackWidth = 1.06;
    const wheelRadius = 0.65;
    const restLen = 0.86;
    const mountY = -0.15;

    // Per-wheel spring rate: ~58,000 N/m. Tuned for 8.2-ton Dakar Rally Raid Truck
    const kSpring = 58000;
    const kDamp = 15000;

    const wheelConfigs: WheelConfig[] = [
      // Axle 1: Front Steering & 4WD Drive
      {
        localMountPoint: new THREE.Vector3(-trackWidth, mountY, 2.16),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring,
        suspensionDamping: kDamp,
        maxTravel: 0.60,
        isFront: true,
        isDrive: true
      },
      {
        localMountPoint: new THREE.Vector3(trackWidth, mountY, 2.16),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring,
        suspensionDamping: kDamp,
        maxTravel: 0.60,
        isFront: true,
        isDrive: true
      },
      // Axle 2: Rear Axle with Differential Lock & 4WD Drive
      {
        localMountPoint: new THREE.Vector3(-trackWidth, mountY, -2.14),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring + 5000,
        suspensionDamping: kDamp + 1200,
        maxTravel: 0.60,
        isFront: false,
        isDrive: true
      },
      {
        localMountPoint: new THREE.Vector3(trackWidth, mountY, -2.14),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring + 5000,
        suspensionDamping: kDamp + 1200,
        maxTravel: 0.60,
        isFront: false,
        isDrive: true
      }
    ];

    this.wheels = wheelConfigs.map((cfg) => ({
      config: cfg,
      inContact: false,
      hitDistance: cfg.suspensionRestLength,
      compression: 0,
      suspensionLength: cfg.suspensionRestLength,
      steerAngle: 0,
      rotationAngle: 0,
      worldPosition: new THREE.Vector3(),
      worldRotation: new THREE.Quaternion(),
      surfaceType: 'trail'
    }));
  }

  public update(dt: number, input: VehicleInput, surfaceQuery?: (x: number, z: number) => SurfaceInfo) {
    if (dt <= 0) return;

    // 1. Smooth Steering Input with Speed Sensitivity
    const speedRatio = Math.min(1.0, this.speedKmh / 90.0);
    const speedAdaptedMaxSteer = this.maxSteerAngle * (1.0 - speedRatio * 0.35);
    const targetSteer = -input.steering * speedAdaptedMaxSteer;
    this.currentSteer = THREE.MathUtils.lerp(
      this.currentSteer,
      targetSteer,
      Math.min(1.0, dt * this.steerSpeed)
    );

    // Chassis Transform & Velocities
    const chassisPosRaw = this.chassisBody.translation();
    const chassisRotRaw = this.chassisBody.rotation();
    const linvelRaw = this.chassisBody.linvel();
    const angvelRaw = this.chassisBody.angvel();

    _chPos.set(chassisPosRaw.x, chassisPosRaw.y, chassisPosRaw.z);
    _chQuat.set(chassisRotRaw.x, chassisRotRaw.y, chassisRotRaw.z, chassisRotRaw.w);
    _linVel.set(linvelRaw.x, linvelRaw.y, linvelRaw.z);
    _angVel.set(angvelRaw.x, angvelRaw.y, angvelRaw.z);

    // Local Chassis Coordinate Directions
    _vFwd.copy(_zAxis).applyQuaternion(_chQuat);
    _vUp.copy(_yAxis).applyQuaternion(_chQuat);
    _vRight.copy(_xAxis).applyQuaternion(_chQuat);

    // Forward speed along heading
    const forwardSpeed = _linVel.dot(_vFwd);
    this.speedKmh = Math.abs(forwardSpeed) * 3.6;

    let totalWheelsGrounded = 0;

    // Low-range crawl gear: 2.5x torque below 25 km/h for climbing steep off-road hills & obstacles
    const crawlRatio = THREE.MathUtils.lerp(2.5, 1.0, Math.min(1.0, this.speedKmh / 28.0));
    const powerCurve = Math.max(0.35, 1.0 - (this.speedKmh / 150.0));
    const totalEngineThrust = input.throttle * this.engineHorsepower * crawlRatio * powerCurve * this.powerMultiplier;

    // 2. Iterate each wheel (Raycast Physics + Dynamic Grip)
    for (let i = 0; i < this.wheels.length; i++) {
      const wheel = this.wheels[i];
      const cfg = wheel.config;

      // Steering angle on front axle
      wheel.steerAngle = cfg.isFront ? this.currentSteer : 0.0;

      // Hardpoint in World Space
      _hardpoint.copy(cfg.localMountPoint).applyQuaternion(_chQuat).add(_chPos);

      // Downward raycast vector
      _rayDir.copy(_vUp).multiplyScalar(-1);
      const maxRayDist = cfg.suspensionRestLength + cfg.radius;

      const ray = new this.rapier.Ray(
        { x: _hardpoint.x, y: _hardpoint.y, z: _hardpoint.z },
        { x: _rayDir.x, y: _rayDir.y, z: _rayDir.z }
      );

      const hit = this.world.castRayAndGetNormal(
        ray,
        maxRayDist,
        true,
        undefined,
        undefined,
        this.chassisCollider,
        this.chassisBody
      );

      if (hit && hit.timeOfImpact <= maxRayDist) {
        wheel.inContact = true;
        totalWheelsGrounded++;
        wheel.hitDistance = hit.timeOfImpact;

        const currentSuspLength = Math.max(
          cfg.suspensionRestLength - cfg.maxTravel,
          hit.timeOfImpact - cfg.radius
        );
        wheel.suspensionLength = currentSuspLength;
        wheel.compression = cfg.suspensionRestLength - currentSuspLength;

        // Query ground surface properties under contact point
        const surf = surfaceQuery
          ? surfaceQuery(_hardpoint.x, _hardpoint.z)
          : { type: 'trail', friction: 0.98, rollingResistance: 0.05, depth: 0.0, bumpiness: 0.0 };
        wheel.surfaceType = surf.type;

        // Point velocity at contact
        _rContact.copy(_hardpoint).sub(_chPos);
        _angCross.copy(_angVel).cross(_rContact);
        _pointVel.copy(_linVel).add(_angCross);

        // Suspension vertical velocity along chassis up
        const vUpVel = _pointVel.dot(_vUp);

        // Correct physics spring + damper force:
        // When compressing (vUpVel < 0): adds upward resistance
        // When rebounding (vUpVel > 0): subtracts upward force to kill bounce
        const springForceMag = Math.min(
          75000,
          Math.max(0, cfg.suspensionStiffness * wheel.compression - cfg.suspensionDamping * vUpVel)
        );

        // Apply upward spring impulse
        _suspImpulse.copy(_vUp).multiplyScalar(springForceMag * dt);
        this.chassisBody.applyImpulseAtPoint(_suspImpulse, _hardpoint, true);

        // Tire Directions (Accounting for steering)
        _wheelSteerQuat.setFromAxisAngle(_yAxis, wheel.steerAngle);
        _wheelLocalQuat.copy(_chQuat).multiply(_wheelSteerQuat);
        _wheelFwd.copy(_zAxis).applyQuaternion(_wheelLocalQuat);
        _wheelRight.copy(_xAxis).applyQuaternion(_wheelLocalQuat);

        // Forward and Lateral Speeds
        const wheelFwdSpeed = _pointVel.dot(_wheelFwd);
        const wheelLatSpeed = _pointVel.dot(_wheelRight);

        // Track handbrake state
        this.isHandbraking = input.handbrake;

        // 1. Acceleration / Drive Force Split (6WD: 28% Front, 36% Mid, 36% Rear)
        const isRear = !cfg.isFront;
        const allowDrive = cfg.isDrive && (!input.handbrake || !isRear);

        if (allowDrive && Math.abs(input.throttle) > 0.05) {
          const torqueShare = 0.25; // 25% to each of the 4 wheels = 100% full 4WD torque distribution
          const driveForceMag = totalEngineThrust * torqueShare;
          _driveImpulse.copy(_wheelFwd).multiplyScalar(driveForceMag * dt);
          this.chassisBody.applyImpulseAtPoint(_driveImpulse, _hardpoint, true);
        }

        // 2. Mud & Water Rolling Resistance / Viscous Drag
        if (surf.depth > 0.01) {
          const dragMag = surf.rollingResistance * 2400.0 * Math.abs(wheelFwdSpeed) * surf.depth;
          _dragImpulse.copy(_wheelFwd).multiplyScalar(
            -Math.sign(wheelFwdSpeed) * Math.min(dragMag * dt, 4500.0)
          );
          this.chassisBody.applyImpulseAtPoint(_dragImpulse, _hardpoint, true);
        }

        // 3. Braking & Handbrake Lockup
        const isHandbrakingThisWheel = input.handbrake && isRear;
        const isFootBraking = input.throttle < 0 && forwardSpeed > 1.0;

        if (isHandbrakingThisWheel) {
          // Heavy rear 4-wheel lockup (initiates rally drift flick)
          const hbForce = 110000.0;
          const brakeImpulseMag = Math.min(Math.abs(wheelFwdSpeed) * 7500, hbForce * dt);
          _brakeImpulse.copy(_wheelFwd).multiplyScalar(-Math.sign(wheelFwdSpeed) * brakeImpulseMag);
          this.chassisBody.applyImpulseAtPoint(_brakeImpulse, _hardpoint, true);

          if (this.speedKmh < 3.0) {
            _parkImpulse.copy(_linVel).multiplyScalar(-3000.0 * dt);
            this.chassisBody.applyImpulse(_parkImpulse, true);
          }
        } else if (isFootBraking) {
          // Hydraulic 6-wheel service brakes
          const brakeImpulseMag = Math.min(Math.abs(wheelFwdSpeed) * 3500, this.brakeForce * dt);
          _brakeImpulse.copy(_wheelFwd).multiplyScalar(-Math.sign(wheelFwdSpeed) * brakeImpulseMag);
          this.chassisBody.applyImpulseAtPoint(_brakeImpulse, _hardpoint, true);
        }

        // 4. Pacejka Non-Linear Lateral Friction (Authentic Cornering Grip & Drift)
        const slipAngle = Math.atan2(wheelLatSpeed, Math.max(1.8, Math.abs(wheelFwdSpeed)));
        const pacejkaGrip = Math.sin(1.62 * Math.atan(7.5 * Math.abs(slipAngle)));

        let effectiveMu = surf.friction * this.lateralGrip;
        if (isHandbrakingThisWheel) {
          // Break rear traction loose into smooth power-slide
          effectiveMu = 0.18;
        }

        const maxLateralGripForce = springForceMag * effectiveMu;
        const corneringForce = -Math.sign(slipAngle) * pacejkaGrip * maxLateralGripForce;
        _latImpulse.copy(_wheelRight).multiplyScalar(corneringForce * dt);
        this.chassisBody.applyImpulseAtPoint(_latImpulse, _hardpoint, true);

        // Wheel Rotation (Freeze rear rotation when locked by handbrake)
        if (!isHandbrakingThisWheel) {
          wheel.rotationAngle += (wheelFwdSpeed / cfg.radius) * dt;
        }

        // Visual Wheel Position
        wheel.worldPosition.copy(_hardpoint).addScaledVector(_rayDir, currentSuspLength);
        wheel.worldRotation.copy(_wheelLocalQuat);
      } else {
        // Airborne wheel
        wheel.inContact = false;
        wheel.compression = 0;
        wheel.suspensionLength = cfg.suspensionRestLength;
        wheel.worldPosition.copy(_hardpoint).addScaledVector(_rayDir, cfg.suspensionRestLength);

        _wheelSteerQuat.setFromAxisAngle(_yAxis, wheel.steerAngle);
        wheel.worldRotation.copy(_chQuat).multiply(_wheelSteerQuat);
      }
    }

    // Anti-Roll Bar simulation along local chassis up vector (Front & Rear Axles)
    if (this.wheels.length >= 6) {
      this.applyAntiRollBar(this.wheels[0], this.wheels[1], dt, _vUp);
      this.applyAntiRollBar(this.wheels[2], this.wheels[3], dt, _vUp);
      this.applyAntiRollBar(this.wheels[4], this.wheels[5], dt, _vUp);
    } else if (this.wheels.length >= 4) {
      this.applyAntiRollBar(this.wheels[0], this.wheels[1], dt, _vUp);
      this.applyAntiRollBar(this.wheels[2], this.wheels[3], dt, _vUp);
    }

    // Active Upright Roll Stabilization Assist: Damp extreme roll when leaning dangerously (> 26 deg / 0.45 rad)
    const tiltAngle = _vUp.angleTo(_worldUp);
    if (tiltAngle > 0.45) {
      _rollCorrectionAxis.crossVectors(_vUp, _worldUp).normalize();
      const angVel = this.chassisBody.angvel();
      _rollDampTorque.set(angVel.x, angVel.y, angVel.z).multiplyScalar(-18000.0 * dt);
      this.chassisBody.applyTorqueImpulse(_rollDampTorque, true);

      const rightingMag = Math.min((tiltAngle - 0.45) * 90000.0, 180000.0);
      _rightingTorque.copy(_rollCorrectionAxis).multiplyScalar(rightingMag * dt);
      this.chassisBody.applyTorqueImpulse(_rightingTorque, true);
    }

    // Auto-Recovery: If upside down or on side for more than 1 second, smoothly self-right
    if (tiltAngle > 1.15) {
      const angVel = this.chassisBody.angvel();
      this.chassisBody.setAngvel({ x: angVel.x * 0.85, y: angVel.y * 0.85, z: angVel.z * 0.85 }, true);
      _rightingImpulse.set(0, 22000.0 * dt, 0);
      this.chassisBody.applyImpulse(_rightingImpulse, true);
    }

    // Airtime Tracker
    this.isAirborne = totalWheelsGrounded === 0;
    if (this.isAirborne) {
      this.airtime += dt;
    } else {
      this.airtime = 0.0;
    }

    // Handle Reset
    if (input.resetRequested) {
      this.resetToSafePosition();
    }
  }

  private applyAntiRollBar(wheelL: WheelState, wheelR: WheelState, dt: number, vUp: THREE.Vector3) {
    const travelDiff = wheelL.compression - wheelR.compression;
    if (Math.abs(travelDiff) > 0.001) {
      // Level chassis: push heavily compressed wheel up (+vUp), pull extended wheel down (-vUp)
      const antiRollForce = Math.min(25000, Math.max(-25000, travelDiff * this.antiRollStiffness));
      _antiRollImpulseL.copy(vUp).multiplyScalar(antiRollForce * dt);
      _antiRollImpulseR.copy(vUp).multiplyScalar(-antiRollForce * dt);

      this.chassisBody.applyImpulseAtPoint(_antiRollImpulseL, wheelL.worldPosition, true);
      this.chassisBody.applyImpulseAtPoint(_antiRollImpulseR, wheelR.worldPosition, true);
    }
  }

  public resetToSafePosition(targetPos = new THREE.Vector3(0, 1.35, 12)) {
    this.chassisBody.setTranslation({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, true);
    this.chassisBody.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true); // Face forward North (-Z)
    this.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.currentSteer = 0;
    this.speedKmh = 0;
    this.airtime = 0;
  }
}

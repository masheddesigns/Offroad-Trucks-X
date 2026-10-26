import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { VehicleInput } from '../input/InputManager';

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
}

export class RaycastVehicle {
  public chassisBody: RAPIER.RigidBody;
  public chassisCollider: RAPIER.Collider;
  public wheels: WheelState[] = [];

  // Handling and Tuning
  public maxSteerAngle: number = 0.58; // ~33 degrees
  public steerSpeed: number = 4.0;
  public currentSteer: number = 0.0;
  public engineHorsepower: number = 38000.0; // Scaled for heavy rally truck
  public brakeForce: number = 42000.0;
  public lateralGrip: number = 0.88;
  public antiRollStiffness: number = 18000.0;
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
    initialPos: THREE.Vector3 = new THREE.Vector3(0, 4, 0)
  ) {
    this.rapier = rapier;
    this.world = world;

    // 1. Create Heavy Truck Chassis Body
    const bodyDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(initialPos.x, initialPos.y, initialPos.z)
      .setLinearDamping(0.35)
      .setAngularDamping(1.8) // High damping for rock-solid Dakar stability
      .setCanSleep(false);

    this.chassisBody = world.createRigidBody(bodyDesc);

    // 2. Chassis Collider (Length: 5.6m, Width: 2.6m, Height: 1.8m)
    const colliderDesc = rapier.ColliderDesc.cuboid(1.25, 0.75, 2.6)
      .setDensity(1.0)
      .setFriction(0.5)
      .setRestitution(0.02);

    this.chassisCollider = world.createCollider(colliderDesc, this.chassisBody);

    // Center of mass offset: keep it low for heavy bottom-weighted Dakar ladder frame
    this.chassisCollider.setMassProperties(
      7500.0, // 7.5 metric tons
      { x: 0, y: -0.65, z: 0 },
      { x: 24000, y: 26000, z: 16000 }, // True physical moment of inertia
      { x: 0, y: 0, z: 0, w: 1 }
    );
    // CRITICAL: Rapier requires explicit recompute on the rigid body!
    this.chassisBody.recomputeMassPropertiesFromColliders();

    // 3. Define 4 Wheels (Validating 4-wheel physics first)
    const trackWidth = 1.35;
    const wheelbase = 1.95;
    const wheelRadius = 0.62;
    const restLen = 0.85;

    const wheelConfigs: WheelConfig[] = [
      // Front Left
      {
        localMountPoint: new THREE.Vector3(-trackWidth, -0.2, wheelbase),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: 56000,
        suspensionDamping: 13500, // Critical damping tuned to prevent bouncing
        maxTravel: 0.55,
        isFront: true,
        isDrive: true
      },
      // Front Right
      {
        localMountPoint: new THREE.Vector3(trackWidth, -0.2, wheelbase),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: 56000,
        suspensionDamping: 13500,
        maxTravel: 0.55,
        isFront: true,
        isDrive: true
      },
      // Rear Left
      {
        localMountPoint: new THREE.Vector3(-trackWidth, -0.2, -wheelbase),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: 62000,
        suspensionDamping: 14500,
        maxTravel: 0.55,
        isFront: false,
        isDrive: true
      },
      // Rear Right
      {
        localMountPoint: new THREE.Vector3(trackWidth, -0.2, -wheelbase),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: 62000,
        suspensionDamping: 14500,
        maxTravel: 0.55,
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
      worldRotation: new THREE.Quaternion()
    }));
  }

  public update(dt: number, input: VehicleInput) {
    if (dt <= 0) return;

    // Smooth steering input
    const targetSteer = -input.steering * this.maxSteerAngle;
    this.currentSteer = THREE.MathUtils.lerp(
      this.currentSteer,
      targetSteer,
      Math.min(1.0, dt * this.steerSpeed)
    );

    // Chassis Transform
    const chassisTrans = this.chassisBody.translation();
    const chassisRot = this.chassisBody.rotation();
    const chassisPos = new THREE.Vector3(chassisTrans.x, chassisTrans.y, chassisTrans.z);
    const chassisQuat = new THREE.Quaternion(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);

    // Vehicle Local Axes in World Space
    const vForward = new THREE.Vector3(0, 0, 1).applyQuaternion(chassisQuat);
    const vUp = new THREE.Vector3(0, 1, 0).applyQuaternion(chassisQuat);
    const vRight = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisQuat);

    // Velocity & Speed
    const linVel = this.chassisBody.linvel();
    const angVel = this.chassisBody.angvel();
    const linearVelocity = new THREE.Vector3(linVel.x, linVel.y, linVel.z);
    const angularVelocity = new THREE.Vector3(angVel.x, angVel.y, angVel.z);

    const forwardSpeed = linearVelocity.dot(vForward);
    this.speedKmh = Math.abs(forwardSpeed) * 3.6;

    let totalWheelsGrounded = 0;

    // Simulate Each Wheel Suspension & Tire Contact
    for (let i = 0; i < this.wheels.length; i++) {
      const wheel = this.wheels[i];
      const cfg = wheel.config;

      if (cfg.isFront) {
        wheel.steerAngle = this.currentSteer;
      } else {
        wheel.steerAngle = 0;
      }

      // Hardpoint in World Space
      const hardpointWorld = cfg.localMountPoint.clone().applyQuaternion(chassisQuat).add(chassisPos);

      // Cast Ray Downward in chassis local down direction
      const rayDir = vUp.clone().multiplyScalar(-1);
      const maxRayDist = cfg.suspensionRestLength + cfg.radius;

      const ray = new this.rapier.Ray(
        { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
        { x: rayDir.x, y: rayDir.y, z: rayDir.z }
      );

      // Filter collision so we don't raycast against our own chassis collider
      const hit = this.world.castRayAndGetNormal(
        ray,
        maxRayDist,
        true,
        undefined,
        undefined,
        this.chassisCollider
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

        // Point velocity at contact
        const rContact = hardpointWorld.clone().sub(chassisPos);
        const pointVel = linearVelocity.clone().add(angularVelocity.clone().cross(rContact));

        // Suspension Velocity (damping calculation)
        const suspVel = pointVel.dot(rayDir);
        const springForceMag = Math.max(
          0,
          cfg.suspensionStiffness * wheel.compression - cfg.suspensionDamping * suspVel
        );

        // Apply upward spring impulse
        const suspImpulse = vUp.clone().multiplyScalar(springForceMag * dt);
        this.chassisBody.applyImpulseAtPoint(
          { x: suspImpulse.x, y: suspImpulse.y, z: suspImpulse.z },
          { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
          true
        );

        // Tire Directions (Accounting for steering)
        const wheelSteerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wheel.steerAngle);
        const wheelLocalQuat = chassisQuat.clone().multiply(wheelSteerQuat);
        const wheelFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wheelLocalQuat);
        const wheelRight = new THREE.Vector3(1, 0, 0).applyQuaternion(wheelLocalQuat);

        // Forward and Lateral Speeds
        const wheelFwdSpeed = pointVel.dot(wheelFwd);
        const wheelLatSpeed = pointVel.dot(wheelRight);

        // Track handbrake state
        this.isHandbraking = input.handbrake;

        // 1. Acceleration / Drive Force
        const isRear = !cfg.isFront;
        const allowDrive = cfg.isDrive && (!input.handbrake || !isRear);

        if (allowDrive && Math.abs(input.throttle) > 0.05) {
          // Horsepower scaling with speed curve and fuel multiplier
          const powerCurve = Math.max(0.2, 1.0 - (this.speedKmh / 160.0));
          const driveForceMag = input.throttle * this.engineHorsepower * powerCurve * this.powerMultiplier;
          const driveImpulse = wheelFwd.clone().multiplyScalar(driveForceMag * dt);

          this.chassisBody.applyImpulseAtPoint(
            { x: driveImpulse.x, y: driveImpulse.y, z: driveImpulse.z },
            { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
            true
          );
        }

        // 2. Braking & Handbrake
        const isHandbrakingThisWheel = input.handbrake && isRear;
        const isFootBraking = input.throttle < 0 && forwardSpeed > 1.0;

        if (isHandbrakingThisWheel) {
          // Heavy rear wheel lockup
          const hbForce = 95000.0;
          const brakeImpulseMag = Math.min(Math.abs(wheelFwdSpeed) * 7500, hbForce * dt);
          const brakeImpulse = wheelFwd.clone().multiplyScalar(-Math.sign(wheelFwdSpeed) * brakeImpulseMag);

          this.chassisBody.applyImpulseAtPoint(
            { x: brakeImpulse.x, y: brakeImpulse.y, z: brakeImpulse.z },
            { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
            true
          );

          // If truck is almost stopped, apply a parking brake anchor
          if (this.speedKmh < 3.0) {
            const parkImpulse = linearVelocity.clone().multiplyScalar(-3000.0 * dt);
            this.chassisBody.applyImpulse(
              { x: parkImpulse.x, y: parkImpulse.y, z: parkImpulse.z },
              true
            );
          }
        } else if (isFootBraking) {
          // Normal 4-wheel hydraulic service brake
          const brakeImpulseMag = Math.min(Math.abs(wheelFwdSpeed) * 3500, this.brakeForce * dt);
          const brakeImpulse = wheelFwd.clone().multiplyScalar(-Math.sign(wheelFwdSpeed) * brakeImpulseMag);

          this.chassisBody.applyImpulseAtPoint(
            { x: brakeImpulse.x, y: brakeImpulse.y, z: brakeImpulse.z },
            { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
            true
          );
        }

        // 3. Lateral Grip / Friction (Anti-slip / Drift physics)
        let effectiveLateralGrip = this.lateralGrip;
        if (isHandbrakingThisWheel) {
          // Drop rear lateral grip when locked to break loose and initiate rally drift!
          effectiveLateralGrip = 0.16;
        }

        const maxLateralGripForce = springForceMag * effectiveLateralGrip;
        const targetLatCorrection = -wheelLatSpeed * 4500.0;
        const clampedLatForce = Math.max(-maxLateralGripForce, Math.min(maxLateralGripForce, targetLatCorrection));
        const lateralImpulse = wheelRight.clone().multiplyScalar(clampedLatForce * dt);

        this.chassisBody.applyImpulseAtPoint(
          { x: lateralImpulse.x, y: lateralImpulse.y, z: lateralImpulse.z },
          { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
          true
        );

        // Wheel Rotation (Freeze rear rotation when locked by handbrake)
        if (!isHandbrakingThisWheel) {
          wheel.rotationAngle += (wheelFwdSpeed / cfg.radius) * dt;
        }

        // Visual Wheel Position
        wheel.worldPosition.copy(hardpointWorld).add(rayDir.clone().multiplyScalar(currentSuspLength));
        wheel.worldRotation.copy(wheelLocalQuat);
      } else {
        // Airborne wheel
        wheel.inContact = false;
        wheel.compression = 0;
        wheel.suspensionLength = cfg.suspensionRestLength;
        wheel.worldPosition.copy(hardpointWorld).add(rayDir.clone().multiplyScalar(cfg.suspensionRestLength));

        const wheelSteerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wheel.steerAngle);
        wheel.worldRotation.copy(chassisQuat.clone().multiply(wheelSteerQuat));
      }
    }

    // Anti-Roll Bar simulation along local chassis up vector (Front & Rear Axles)
    this.applyAntiRollBar(this.wheels[0], this.wheels[1], dt, vUp);
    this.applyAntiRollBar(this.wheels[2], this.wheels[3], dt, vUp);

    // Active Upright Roll Stabilization Assist (Prevents Flipping / Rollover)
    const worldUp = new THREE.Vector3(0, 1, 0);
    const tiltAngle = vUp.angleTo(worldUp);
    if (tiltAngle > 0.15) { // If tilted more than ~8 degrees
      const correctionAxis = new THREE.Vector3().crossVectors(vUp, worldUp).normalize();
      const torqueMag = Math.min(tiltAngle * 140000.0, 320000.0);
      const torque = correctionAxis.multiplyScalar(torqueMag * dt);
      this.chassisBody.applyTorqueImpulse({ x: torque.x, y: torque.y, z: torque.z }, true);
    }

    // Auto-Recovery: If upside down or on side for more than 1 second, smoothly self-right
    if (tiltAngle > 1.2) { // Tilted past ~70 degrees (on side or roof)
      const angVel = this.chassisBody.angvel();
      this.chassisBody.setAngvel({ x: angVel.x * 0.9, y: angVel.y * 0.9, z: angVel.z * 0.9 }, true);
      const rightingImpulse = new THREE.Vector3(0, 18000.0 * dt, 0);
      this.chassisBody.applyImpulse({ x: rightingImpulse.x, y: rightingImpulse.y, z: rightingImpulse.z }, true);
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
      const antiRollForce = travelDiff * this.antiRollStiffness;
      const impulseL = vUp.clone().multiplyScalar(-antiRollForce * dt);
      const impulseR = vUp.clone().multiplyScalar(antiRollForce * dt);

      this.chassisBody.applyImpulseAtPoint(
        { x: impulseL.x, y: impulseL.y, z: impulseL.z },
        { x: wheelL.worldPosition.x, y: wheelL.worldPosition.y, z: wheelL.worldPosition.z },
        true
      );
      this.chassisBody.applyImpulseAtPoint(
        { x: impulseR.x, y: impulseR.y, z: impulseR.z },
        { x: wheelR.worldPosition.x, y: wheelR.worldPosition.y, z: wheelR.worldPosition.z },
        true
      );
    }
  }

  public resetToSafePosition(targetPos = new THREE.Vector3(0, 4, 0)) {
    this.chassisBody.setTranslation({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, true);
    this.chassisBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.currentSteer = 0;
    this.speedKmh = 0;
    this.airtime = 0;
  }
}

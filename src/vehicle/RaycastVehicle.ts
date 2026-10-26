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

    // 2. Chassis Collider (Length: 5.6m, Width: 2.6m, Height: 1.6m)
    const colliderDesc = rapier.ColliderDesc.cuboid(1.25, 0.75, 2.6)
      .setDensity(1.0)
      .setFriction(0.6)
      .setRestitution(0.01);

    this.chassisCollider = world.createCollider(colliderDesc, this.chassisBody);

    // Low Center of Mass for Authentic Off-Road Stability
    this.chassisCollider.setMassProperties(
      7500.0, // 7.5 metric tons
      { x: 0, y: -0.65, z: -0.15 },
      { x: 26000, y: 28000, z: 18000 },
      { x: 0, y: 0, z: 0, w: 1 }
    );
    this.chassisBody.recomputeMassPropertiesFromColliders();

    // 3. Define 6 Physical Wheels for the 6x6 Heavy All-Terrain Setup
    const trackWidth = 1.28;
    const wheelRadius = 0.58;
    const restLen = 0.76;
    const mountY = -0.25;

    // Per-wheel spring rate: ~42,000 N/m. Critical damping ~14,490 Ns/m. Tuned to 11,200 Ns/m.
    const kSpring = 42000;
    const kDamp = 11200;

    const wheelConfigs: WheelConfig[] = [
      // Axle 1: Front Steering & 4WD Drive
      {
        localMountPoint: new THREE.Vector3(-trackWidth, mountY, 2.40),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring,
        suspensionDamping: kDamp,
        maxTravel: 0.52,
        isFront: true,
        isDrive: true
      },
      {
        localMountPoint: new THREE.Vector3(trackWidth, mountY, 2.40),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring,
        suspensionDamping: kDamp,
        maxTravel: 0.52,
        isFront: true,
        isDrive: true
      },
      // Axle 2: Mid Tandem Drive
      {
        localMountPoint: new THREE.Vector3(-trackWidth, mountY, -1.35),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring + 3000,
        suspensionDamping: kDamp + 800,
        maxTravel: 0.52,
        isFront: false,
        isDrive: true
      },
      {
        localMountPoint: new THREE.Vector3(trackWidth, mountY, -1.35),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring + 3000,
        suspensionDamping: kDamp + 800,
        maxTravel: 0.52,
        isFront: false,
        isDrive: true
      },
      // Axle 3: Rear Tandem Drive
      {
        localMountPoint: new THREE.Vector3(-trackWidth, mountY, -2.66),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring + 3000,
        suspensionDamping: kDamp + 800,
        maxTravel: 0.52,
        isFront: false,
        isDrive: true
      },
      {
        localMountPoint: new THREE.Vector3(trackWidth, mountY, -2.66),
        radius: wheelRadius,
        suspensionRestLength: restLen,
        suspensionStiffness: kSpring + 3000,
        suspensionDamping: kDamp + 800,
        maxTravel: 0.52,
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

    const chassisPos = new THREE.Vector3(chassisPosRaw.x, chassisPosRaw.y, chassisPosRaw.z);
    const chassisQuat = new THREE.Quaternion(chassisRotRaw.x, chassisRotRaw.y, chassisRotRaw.z, chassisRotRaw.w);
    const linearVelocity = new THREE.Vector3(linvelRaw.x, linvelRaw.y, linvelRaw.z);
    const angularVelocity = new THREE.Vector3(angvelRaw.x, angvelRaw.y, angvelRaw.z);

    // Local Chassis Coordinate Directions
    const vFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(chassisQuat);
    const vUp = new THREE.Vector3(0, 1, 0).applyQuaternion(chassisQuat);
    const vRight = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisQuat);

    // Forward speed along heading
    const forwardSpeed = linearVelocity.dot(vFwd);
    this.speedKmh = Math.abs(forwardSpeed) * 3.6;

    let totalWheelsGrounded = 0;

    // Low-range crawl gear: 2.2x torque below 25 km/h for climbing steep off-road ruts
    const crawlRatio = THREE.MathUtils.lerp(2.2, 1.0, Math.min(1.0, this.speedKmh / 28.0));
    const powerCurve = Math.max(0.25, 1.0 - (this.speedKmh / 150.0));
    const totalEngineThrust = input.throttle * this.engineHorsepower * crawlRatio * powerCurve * this.powerMultiplier;

    // 2. Iterate each wheel (Raycast Physics + Dynamic Grip)
    for (let i = 0; i < this.wheels.length; i++) {
      const wheel = this.wheels[i];
      const cfg = wheel.config;

      // Steering angle on front axle
      if (cfg.isFront) {
        wheel.steerAngle = this.currentSteer;
      } else {
        wheel.steerAngle = 0.0;
      }

      // Hardpoint in World Space
      const hardpointWorld = cfg.localMountPoint.clone().applyQuaternion(chassisQuat).add(chassisPos);

      // Downward raycast vector
      const rayDir = vUp.clone().multiplyScalar(-1);
      const maxRayDist = cfg.suspensionRestLength + cfg.radius;

      const ray = new this.rapier.Ray(
        { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
        { x: rayDir.x, y: rayDir.y, z: rayDir.z }
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
          ? surfaceQuery(hardpointWorld.x, hardpointWorld.z)
          : { type: 'trail', friction: 0.98, rollingResistance: 0.05, depth: 0.0, bumpiness: 0.0 };
        wheel.surfaceType = surf.type;

        // Point velocity at contact
        const rContact = hardpointWorld.clone().sub(chassisPos);
        const pointVel = linearVelocity.clone().add(angularVelocity.clone().cross(rContact));

        // Suspension vertical velocity along chassis up
        const vUpVel = pointVel.dot(vUp);

        // Correct physics spring + damper force:
        // When compressing (vUpVel < 0): adds upward resistance
        // When rebounding (vUpVel > 0): subtracts upward force to kill bounce
        const springForceMag = Math.min(
          75000,
          Math.max(0, cfg.suspensionStiffness * wheel.compression - cfg.suspensionDamping * vUpVel)
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

        // 1. Acceleration / Drive Force Split (6WD: 28% Front, 36% Mid, 36% Rear)
        const isRear = !cfg.isFront;
        const allowDrive = cfg.isDrive && (!input.handbrake || !isRear);

        if (allowDrive && Math.abs(input.throttle) > 0.05) {
          const torqueShare = cfg.isFront ? 0.14 : 0.18;
          const driveForceMag = totalEngineThrust * torqueShare;
          const driveImpulse = wheelFwd.clone().multiplyScalar(driveForceMag * dt);

          this.chassisBody.applyImpulseAtPoint(
            { x: driveImpulse.x, y: driveImpulse.y, z: driveImpulse.z },
            { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
            true
          );
        }

        // 2. Mud & Water Rolling Resistance / Viscous Drag
        if (surf.depth > 0.01) {
          const dragMag = surf.rollingResistance * 2400.0 * Math.abs(wheelFwdSpeed) * surf.depth;
          const dragImpulse = wheelFwd.clone().multiplyScalar(
            -Math.sign(wheelFwdSpeed) * Math.min(dragMag * dt, 4500.0)
          );
          this.chassisBody.applyImpulseAtPoint(
            { x: dragImpulse.x, y: dragImpulse.y, z: dragImpulse.z },
            { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
            true
          );
        }

        // 3. Braking & Handbrake Lockup
        const isHandbrakingThisWheel = input.handbrake && isRear;
        const isFootBraking = input.throttle < 0 && forwardSpeed > 1.0;

        if (isHandbrakingThisWheel) {
          // Heavy rear 4-wheel lockup (initiates rally drift flick)
          const hbForce = 110000.0;
          const brakeImpulseMag = Math.min(Math.abs(wheelFwdSpeed) * 7500, hbForce * dt);
          const brakeImpulse = wheelFwd.clone().multiplyScalar(-Math.sign(wheelFwdSpeed) * brakeImpulseMag);

          this.chassisBody.applyImpulseAtPoint(
            { x: brakeImpulse.x, y: brakeImpulse.y, z: brakeImpulse.z },
            { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
            true
          );

          if (this.speedKmh < 3.0) {
            const parkImpulse = linearVelocity.clone().multiplyScalar(-3000.0 * dt);
            this.chassisBody.applyImpulse(
              { x: parkImpulse.x, y: parkImpulse.y, z: parkImpulse.z },
              true
            );
          }
        } else if (isFootBraking) {
          // Hydraulic 6-wheel service brakes
          const brakeImpulseMag = Math.min(Math.abs(wheelFwdSpeed) * 3500, this.brakeForce * dt);
          const brakeImpulse = wheelFwd.clone().multiplyScalar(-Math.sign(wheelFwdSpeed) * brakeImpulseMag);

          this.chassisBody.applyImpulseAtPoint(
            { x: brakeImpulse.x, y: brakeImpulse.y, z: brakeImpulse.z },
            { x: hardpointWorld.x, y: hardpointWorld.y, z: hardpointWorld.z },
            true
          );
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
        const lateralImpulse = wheelRight.clone().multiplyScalar(corneringForce * dt);

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

    // Anti-Roll Bar simulation along local chassis up vector (Front, Mid, Rear Axles)
    if (this.wheels.length >= 6) {
      this.applyAntiRollBar(this.wheels[0], this.wheels[1], dt, vUp);
      this.applyAntiRollBar(this.wheels[2], this.wheels[3], dt, vUp);
      this.applyAntiRollBar(this.wheels[4], this.wheels[5], dt, vUp);
    }

    // Active Upright Roll Stabilization Assist: Damp extreme roll when leaning dangerously (> 26 deg / 0.45 rad)
    const worldUp = new THREE.Vector3(0, 1, 0);
    const tiltAngle = vUp.angleTo(worldUp);
    if (tiltAngle > 0.45) {
      const correctionAxis = new THREE.Vector3().crossVectors(vUp, worldUp).normalize();
      const angVel = this.chassisBody.angvel();
      const rollDampTorque = new THREE.Vector3(angVel.x, angVel.y, angVel.z).multiplyScalar(-18000.0 * dt);
      this.chassisBody.applyTorqueImpulse({ x: rollDampTorque.x, y: rollDampTorque.y, z: rollDampTorque.z }, true);

      const rightingMag = Math.min((tiltAngle - 0.45) * 90000.0, 180000.0);
      const torque = correctionAxis.multiplyScalar(rightingMag * dt);
      this.chassisBody.applyTorqueImpulse({ x: torque.x, y: torque.y, z: torque.z }, true);
    }

    // Auto-Recovery: If upside down or on side for more than 1 second, smoothly self-right
    if (tiltAngle > 1.15) {
      const angVel = this.chassisBody.angvel();
      this.chassisBody.setAngvel({ x: angVel.x * 0.85, y: angVel.y * 0.85, z: angVel.z * 0.85 }, true);
      const rightingImpulse = new THREE.Vector3(0, 22000.0 * dt, 0);
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
      // Level chassis: push heavily compressed wheel up (+vUp), pull extended wheel down (-vUp)
      const antiRollForce = Math.min(25000, Math.max(-25000, travelDiff * this.antiRollStiffness));
      const impulseL = vUp.clone().multiplyScalar(antiRollForce * dt);
      const impulseR = vUp.clone().multiplyScalar(-antiRollForce * dt);

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

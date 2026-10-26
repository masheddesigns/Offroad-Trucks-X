import * as THREE from 'three';
import { RaycastVehicle } from './RaycastVehicle';

export class TruckModel {
  public group: THREE.Group;
  public chassisMesh: THREE.Group;

  // Wheel meshes (6 wheels total: 2 Front, 4 Tandem Rear)
  public wheelMeshes: THREE.Group[] = [];
  public suspensionSprings: THREE.Group[] = [];

  // Working Lights
  public headlights: THREE.SpotLight[] = [];
  public brakeLightMaterial!: THREE.MeshStandardMaterial;
  public headlightGlowMaterial!: THREE.MeshStandardMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.chassisMesh = new THREE.Group();
    this.group.add(this.chassisMesh);

    this.buildDetailedDakarChassis();
    this.buildWheelAssemblies();
    this.setupVehicleLights();
  }

  private buildDetailedDakarChassis() {
    // Premium Materials
    const darkCabMat = new THREE.MeshStandardMaterial({
      color: 0x1f2329,
      roughness: 0.35,
      metalness: 0.7
    });

    const dakarOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xff5e00, // Dakar Factory Racing Orange
      roughness: 0.3,
      metalness: 0.55
    });

    const chassisSteelMat = new THREE.MeshStandardMaterial({
      color: 0x121316,
      roughness: 0.7,
      metalness: 0.8
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe0e0e0,
      roughness: 0.15,
      metalness: 0.95
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a141d,
      transmission: 0.7,
      opacity: 0.9,
      transparent: true,
      roughness: 0.1,
      metalness: 0.1
    });

    const radiatorGrilleMat = new THREE.MeshStandardMaterial({
      color: 0x0a0b0d,
      roughness: 0.9,
      metalness: 0.3
    });

    // 1. Heavy Box-Channel Chassis Ladder Frame
    const leftRailGeo = new THREE.BoxGeometry(0.18, 0.35, 6.2);
    const leftRail = new THREE.Mesh(leftRailGeo, chassisSteelMat);
    leftRail.position.set(-0.85, -0.3, -0.2);
    leftRail.castShadow = true;

    const rightRail = leftRail.clone();
    rightRail.position.x = 0.85;

    // Crossmembers
    const crossGeo = new THREE.BoxGeometry(1.6, 0.2, 0.18);
    for (let cz = -2.6; cz <= 2.6; cz += 1.3) {
      const cross = new THREE.Mesh(crossGeo, chassisSteelMat);
      cross.position.set(0, -0.3, cz);
      this.chassisMesh.add(cross);
    }
    this.chassisMesh.add(leftRail, rightRail);

    // 2. Aerodynamic Dakar Racing Cabin
    const cabMainGeo = new THREE.BoxGeometry(2.44, 1.45, 2.2);
    const cabMain = new THREE.Mesh(cabMainGeo, darkCabMat);
    cabMain.position.set(0, 0.82, 1.45);
    cabMain.castShadow = true;
    this.chassisMesh.add(cabMain);

    // Slanted Front Hood / Nose
    const hoodGeo = new THREE.BoxGeometry(2.4, 0.55, 1.1);
    const hood = new THREE.Mesh(hoodGeo, darkCabMat);
    hood.position.set(0, 0.42, 2.75);
    hood.rotation.x = 0.12;
    hood.castShadow = true;
    this.chassisMesh.add(hood);

    // Racing Livery Stripes on Cab
    const cabStripeGeo = new THREE.BoxGeometry(2.46, 0.25, 2.22);
    const cabStripe = new THREE.Mesh(cabStripeGeo, dakarOrangeMat);
    cabStripe.position.set(0, 1.1, 1.45);
    this.chassisMesh.add(cabStripe);

    const roofSpoilerGeo = new THREE.BoxGeometry(2.35, 0.2, 1.0);
    const roofSpoiler = new THREE.Mesh(roofSpoilerGeo, dakarOrangeMat);
    roofSpoiler.position.set(0, 1.62, 1.1);
    roofSpoiler.rotation.x = -0.15;
    this.chassisMesh.add(roofSpoiler);

    // Roof Air Scoops
    const scoopGeo = new THREE.BoxGeometry(0.5, 0.15, 0.6);
    const scoopL = new THREE.Mesh(scoopGeo, darkCabMat);
    scoopL.position.set(-0.55, 1.62, 1.8);
    const scoopR = scoopL.clone();
    scoopR.position.x = 0.55;
    this.chassisMesh.add(scoopL, scoopR);

    // Angled Windshield
    const windshieldGeo = new THREE.BoxGeometry(2.26, 0.85, 0.08);
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0, 1.05, 2.52);
    windshield.rotation.x = -0.28;
    this.chassisMesh.add(windshield);

    // Side Windows
    const sideWinGeo = new THREE.BoxGeometry(0.06, 0.62, 1.1);
    const winL = new THREE.Mesh(sideWinGeo, glassMat);
    winL.position.set(-1.23, 0.95, 1.5);
    const winR = winL.clone();
    winR.position.x = 1.23;
    this.chassisMesh.add(winL, winR);

    // Rally Driver Silhouette Inside Cab
    const helmetGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xff3300 });
    const driverHelmet = new THREE.Mesh(helmetGeo, helmetMat);
    driverHelmet.position.set(-0.6, 0.95, 1.4);
    const codriverHelmet = driverHelmet.clone();
    codriverHelmet.position.x = 0.6;
    this.chassisMesh.add(driverHelmet, codriverHelmet);

    // Front Grille & Radiator Mesh
    const grilleGeo = new THREE.BoxGeometry(2.0, 0.65, 0.08);
    const grille = new THREE.Mesh(grilleGeo, radiatorGrilleMat);
    grille.position.set(0, 0.32, 3.28);
    this.chassisMesh.add(grille);

    // Snorkel Air Intake (Right A-pillar)
    const snorkelPipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 12);
    const snorkelPipe = new THREE.Mesh(snorkelPipeGeo, chassisSteelMat);
    snorkelPipe.position.set(1.26, 1.1, 2.15);
    snorkelPipe.rotation.x = -0.15;
    const snorkelHeadGeo = new THREE.BoxGeometry(0.18, 0.14, 0.25);
    const snorkelHead = new THREE.Mesh(snorkelHeadGeo, chassisSteelMat);
    snorkelHead.position.set(1.26, 1.85, 2.05);
    this.chassisMesh.add(snorkelPipe, snorkelHead);

    // 3. Heavy Tubular Bull Bar & Skid Plate
    const bullBarGroup = new THREE.Group();
    const barGeo = new THREE.CylinderGeometry(0.065, 0.065, 2.5, 12);
    const lowerBar = new THREE.Mesh(barGeo, chassisSteelMat);
    lowerBar.rotation.z = Math.PI / 2;
    lowerBar.position.set(0, 0.1, 3.35);

    const upperBar = lowerBar.clone();
    upperBar.position.set(0, 0.55, 3.3);

    const braceGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8);
    const braceL = new THREE.Mesh(braceGeo, chassisSteelMat);
    braceL.position.set(-0.85, 0.32, 3.32);
    const braceR = braceL.clone();
    braceR.position.x = 0.85;

    // Skid Plate with ventilation slots
    const skidGeo = new THREE.BoxGeometry(1.85, 0.95, 0.08);
    const skid = new THREE.Mesh(skidGeo, chromeMat);
    skid.position.set(0, -0.22, 3.15);
    skid.rotation.x = -0.65;
    bullBarGroup.add(lowerBar, upperBar, braceL, braceR, skid);

    // Yellow Dakar Rally Fog Lights (4 Round Lamps)
    const fogLensMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff8800,
      emissiveIntensity: 3.0
    });
    for (let f = -1.5; f <= 1.5; f += 1.0) {
      const lampGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 16);
      const lamp = new THREE.Mesh(lampGeo, fogLensMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(f * 0.42, 0.72, 3.25);
      bullBarGroup.add(lamp);
    }
    this.chassisMesh.add(bullBarGroup);

    // 4. Dual Chrome Exhaust Stacks
    const pipeGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.1, 16);
    const stackL = new THREE.Mesh(pipeGeo, chromeMat);
    stackL.position.set(-1.08, 1.45, 0.22);
    const stackR = stackL.clone();
    stackR.position.x = 1.08;

    // Curved exhaust tips
    const tipGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.4, 16);
    const tipL = new THREE.Mesh(tipGeo, chromeMat);
    tipL.position.set(-1.08, 2.55, 0.12);
    tipL.rotation.x = -0.4;
    const tipR = tipL.clone();
    tipR.position.x = 1.08;
    this.chassisMesh.add(stackL, stackR, tipL, tipR);

    // 5. Rear Service Body & Equipment Bay
    const serviceBodyGeo = new THREE.BoxGeometry(2.42, 1.55, 3.7);
    const serviceBody = new THREE.Mesh(serviceBodyGeo, darkCabMat);
    serviceBody.position.set(0, 0.72, -1.55);
    serviceBody.castShadow = true;
    this.chassisMesh.add(serviceBody);

    // Dakar Racing Side Graphic Bands
    const rearStripeGeo = new THREE.BoxGeometry(2.44, 0.35, 3.72);
    const rearStripe = new THREE.Mesh(rearStripeGeo, dakarOrangeMat);
    rearStripe.position.set(0, 0.65, -1.55);
    this.chassisMesh.add(rearStripe);

    // External Tubular Roll Cage on Rear Box
    const cageTubeGeo = new THREE.CylinderGeometry(0.045, 0.045, 3.65, 8);
    const cageTopL = new THREE.Mesh(cageTubeGeo, dakarOrangeMat);
    cageTopL.rotation.x = Math.PI / 2;
    cageTopL.position.set(-1.23, 1.52, -1.55);
    const cageTopR = cageTopL.clone();
    cageTopR.position.x = 1.23;
    this.chassisMesh.add(cageTopL, cageTopR);

    // 6. Rear Mounted Equipment (Spare Tires, Jerrycans, Sand Ladders)
    // Dual Dakar Spare Wheels in Rear Niche
    const spareTireGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.42, 20);
    const spareTireMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
    const spare1 = new THREE.Mesh(spareTireGeo, spareTireMat);
    spare1.rotation.x = Math.PI / 2;
    spare1.position.set(-0.55, 0.8, -3.42);
    const spare2 = spare1.clone();
    spare2.position.x = 0.55;

    // Tie-down straps (Orange)
    const strapGeo = new THREE.BoxGeometry(0.08, 1.3, 0.46);
    const strap1 = new THREE.Mesh(strapGeo, dakarOrangeMat);
    strap1.position.set(-0.55, 0.8, -3.42);
    const strap2 = strap1.clone();
    strap2.position.x = 0.55;
    this.chassisMesh.add(spare1, spare2, strap1, strap2);

    // Expedition Jerrycans (Red)
    const canGeo = new THREE.BoxGeometry(0.24, 0.45, 0.35);
    const canMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4 });
    const can1 = new THREE.Mesh(canGeo, canMat);
    can1.position.set(-1.05, 0.25, -3.42);
    const can2 = can1.clone();
    can2.position.x = 1.05;
    this.chassisMesh.add(can1, can2);

    // Perforated Sand Recovery Ladders (Aluminum on flanks)
    const ladderGeo = new THREE.BoxGeometry(0.04, 0.35, 1.8);
    const ladderMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 });
    const ladderL = new THREE.Mesh(ladderGeo, ladderMat);
    ladderL.position.set(-1.24, 0.8, -1.8);
    const ladderR = ladderL.clone();
    ladderR.position.x = 1.24;
    this.chassisMesh.add(ladderL, ladderR);

    // 7. Functional Rear LED Brake Lights
    this.brakeLightMaterial = new THREE.MeshStandardMaterial({
      color: 0x880000,
      emissive: 0x550000,
      emissiveIntensity: 0.6
    });

    const brakeGeo = new THREE.BoxGeometry(0.35, 0.18, 0.05);
    const brakeL = new THREE.Mesh(brakeGeo, this.brakeLightMaterial);
    brakeL.position.set(-1.0, 0.5, -3.45);
    const brakeR = brakeL.clone();
    brakeR.position.x = 1.0;
    this.chassisMesh.add(brakeL, brakeR);
  }

  private setupVehicleLights() {
    // Projecting LED Headlights
    this.headlightGlowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffeedd,
      emissiveIntensity: 3.5
    });

    const lensGeo = new THREE.BoxGeometry(0.42, 0.25, 0.06);
    const lensL = new THREE.Mesh(lensGeo, this.headlightGlowMaterial);
    lensL.position.set(-0.9, 0.38, 3.32);
    const lensR = lensL.clone();
    lensR.position.x = 0.9;
    this.chassisMesh.add(lensL, lensR);

    // Three.js Spotlights projecting beams onto terrain
    const spotL = new THREE.SpotLight(0xfffaed, 8.0, 80, Math.PI / 5, 0.35, 1.2);
    spotL.position.set(-0.9, 0.4, 3.35);
    const targetL = new THREE.Object3D();
    targetL.position.set(-0.9, -0.2, 35);
    this.chassisMesh.add(spotL, targetL);
    spotL.target = targetL;

    const spotR = new THREE.SpotLight(0xfffaed, 8.0, 80, Math.PI / 5, 0.35, 1.2);
    spotR.position.set(0.9, 0.4, 3.35);
    const targetR = new THREE.Object3D();
    targetR.position.set(0.9, -0.2, 35);
    this.chassisMesh.add(spotR, targetR);
    spotR.target = targetR;

    this.headlights = [spotL, spotR];
  }

  private buildWheelAssemblies() {
    // 6-Wheel Dakar Configuration:
    // Index 0: Front Left (Physics Wheel 0)
    // Index 1: Front Right (Physics Wheel 1)
    // Index 2: Rear Tandem Axle 1 Left (Physics Wheel 2)
    // Index 3: Rear Tandem Axle 1 Right (Physics Wheel 3)
    // Index 4: Rear Tandem Axle 2 Left (Visual Tandem Synced to Physics Wheel 2)
    // Index 5: Rear Tandem Axle 2 Right (Visual Tandem Synced to Physics Wheel 3)
    for (let i = 0; i < 6; i++) {
      const wheel = this.createDetailedDakarWheel();
      this.wheelMeshes.push(wheel);
      this.group.add(wheel);

      // Suspension spring mesh
      const spring = this.createSuspensionSpring();
      this.suspensionSprings.push(spring);
      this.group.add(spring);
    }
  }

  private createDetailedDakarWheel(): THREE.Group {
    const wheel = new THREE.Group();

    // Tire Material: Heavy Rubber with micro-texture
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x131417,
      roughness: 0.88,
      metalness: 0.12
    });

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c21,
      roughness: 0.3,
      metalness: 0.85
    });

    const beadlockMat = new THREE.MeshStandardMaterial({
      color: 0xff5e00, // Dakar Orange Ring
      roughness: 0.35,
      metalness: 0.6
    });

    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      roughness: 0.25,
      metalness: 0.95
    });

    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      roughness: 0.3,
      metalness: 0.6
    });

    // 1. Tire Main Donut
    const tireGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.52, 28);
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.rotation.z = Math.PI / 2;
    tireMesh.castShadow = true;
    wheel.add(tireMesh);

    // 2. Chunky Mud Tread Blocks (Chevron Rally Pattern)
    const lugGeo = new THREE.BoxGeometry(0.53, 0.09, 0.14);
    for (let a = 0; a < 18; a++) {
      const angle = (a / 18) * Math.PI * 2;
      const lug = new THREE.Mesh(lugGeo, tireMat);
      lug.position.set(0, Math.sin(angle) * 0.615, Math.cos(angle) * 0.615);
      lug.rotation.x = -angle;
      wheel.add(lug);
    }

    // 3. Heavy-Duty Multi-Spoke Rim
    const rimCenterGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.53, 20);
    const rimCenter = new THREE.Mesh(rimCenterGeo, rimMat);
    rimCenter.rotation.z = Math.PI / 2;
    wheel.add(rimCenter);

    // Orange Outer Beadlock Rings (Left & Right)
    const ringGeo = new THREE.TorusGeometry(0.4, 0.035, 10, 24);
    const ringL = new THREE.Mesh(ringGeo, beadlockMat);
    ringL.position.x = 0.268;
    ringL.rotation.y = Math.PI / 2;
    const ringR = ringL.clone();
    ringR.position.x = -0.268;
    wheel.add(ringL, ringR);

    // 4. Visible Brake Rotor & Racing Caliper Inside Hub
    const rotorGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.rotation.z = Math.PI / 2;
    rotor.position.x = 0.0;
    wheel.add(rotor);

    const caliperGeo = new THREE.BoxGeometry(0.08, 0.2, 0.14);
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(0.02, 0.22, 0);
    wheel.add(caliper);

    return wheel;
  }

  private createSuspensionSpring(): THREE.Group {
    const springGroup = new THREE.Group();

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.2
    });

    const coilMat = new THREE.MeshStandardMaterial({
      color: 0xff5e00,
      metalness: 0.6,
      roughness: 0.3
    });

    // Central Damper Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.8, 12);
    const shaft = new THREE.Mesh(shaftGeo, chromeMat);
    springGroup.add(shaft);

    // Outer Coil Spring Ring Stack
    for (let s = -0.3; s <= 0.3; s += 0.1) {
      const ringGeo = new THREE.TorusGeometry(0.09, 0.025, 8, 16);
      const ring = new THREE.Mesh(ringGeo, coilMat);
      ring.position.y = s;
      ring.rotation.x = Math.PI / 2;
      springGroup.add(ring);
    }

    return springGroup;
  }

  /**
   * Updates visual truck transforms, wheel rotations, suspension springs, and brake lights
   */
  public update(vehicle: RaycastVehicle, isBrakingOrHandbraking: boolean) {
    // 1. Sync Chassis Body Position & Rotation
    const trans = vehicle.chassisBody.translation();
    const rot = vehicle.chassisBody.rotation();

    this.chassisMesh.position.set(trans.x, trans.y, trans.z);
    this.chassisMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    const chassisQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const cPos = new THREE.Vector3(trans.x, trans.y, trans.z);

    // 2. Update Brake Lights Intensity
    if (isBrakingOrHandbraking) {
      this.brakeLightMaterial.emissive.setHex(0xff0000);
      this.brakeLightMaterial.emissiveIntensity = 4.0;
    } else {
      this.brakeLightMaterial.emissive.setHex(0x550000);
      this.brakeLightMaterial.emissiveIntensity = 0.5;
    }

    // 3. Sync Wheels & Dynamic Suspension Compression
    // Wheels 0 & 1: Front Axle (Direct Physics)
    for (let i = 0; i < 2; i++) {
      const ws = vehicle.wheels[i];
      const mesh = this.wheelMeshes[i];
      const spring = this.suspensionSprings[i];

      mesh.position.copy(ws.worldPosition);
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ws.rotationAngle);
      mesh.quaternion.copy(ws.worldRotation).multiply(spinQuat);

      // Suspension Spring positioning between hardpoint and wheel center
      const hpWorld = ws.config.localMountPoint.clone().applyQuaternion(chassisQuat).add(cPos);
      spring.position.copy(hpWorld).add(ws.worldPosition).multiplyScalar(0.5);
      spring.quaternion.copy(chassisQuat);

      const compressionScale = Math.max(0.4, 1.0 - (ws.compression / ws.config.suspensionRestLength));
      spring.scale.set(1.0, compressionScale, 1.0);
    }

    // Wheels 2 & 3: Rear Tandem Axle 1 (Direct Physics)
    for (let i = 2; i < 4; i++) {
      const ws = vehicle.wheels[i];
      const mesh = this.wheelMeshes[i];
      const spring = this.suspensionSprings[i];

      mesh.position.copy(ws.worldPosition);
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ws.rotationAngle);
      mesh.quaternion.copy(ws.worldRotation).multiply(spinQuat);

      const hpWorld = ws.config.localMountPoint.clone().applyQuaternion(chassisQuat).add(cPos);
      spring.position.copy(hpWorld).add(ws.worldPosition).multiplyScalar(0.5);
      spring.quaternion.copy(chassisQuat);

      const compressionScale = Math.max(0.4, 1.0 - (ws.compression / ws.config.suspensionRestLength));
      spring.scale.set(1.0, compressionScale, 1.0);
    }

    // Wheels 4 & 5: Rear Tandem Axle 2 (Offset by -1.25m behind rear physics axle)
    // Synchronized to rear physics wheel travel and spin
    const tandemOffsetLocal = new THREE.Vector3(0, 0, -1.25).applyQuaternion(chassisQuat);
    for (let i = 0; i < 2; i++) {
      const sourceIdx = 2 + i;
      const targetIdx = 4 + i;
      const ws = vehicle.wheels[sourceIdx];
      const mesh = this.wheelMeshes[targetIdx];
      const spring = this.suspensionSprings[targetIdx];

      mesh.position.copy(ws.worldPosition).add(tandemOffsetLocal);
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ws.rotationAngle);
      mesh.quaternion.copy(ws.worldRotation).multiply(spinQuat);

      const hpWorld = ws.config.localMountPoint.clone().applyQuaternion(chassisQuat).add(cPos).add(tandemOffsetLocal);
      spring.position.copy(hpWorld).add(mesh.position).multiplyScalar(0.5);
      spring.quaternion.copy(chassisQuat);

      const compressionScale = Math.max(0.4, 1.0 - (ws.compression / ws.config.suspensionRestLength));
      spring.scale.set(1.0, compressionScale, 1.0);
    }
  }
}

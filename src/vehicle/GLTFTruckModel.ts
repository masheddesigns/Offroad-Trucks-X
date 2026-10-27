import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RaycastVehicle } from './RaycastVehicle';

interface AxleNode {
  node: THREE.Object3D;
  initialPos: THREE.Vector3;
  initialQuat: THREE.Quaternion;
  axleType: 'front' | 'mid' | 'rear';
}

// Reusable scratch objects to eliminate GC allocations
const _truckChassisQuat = new THREE.Quaternion();
const _truckLocalOffset = new THREE.Vector3();
const _spinAxis = new THREE.Vector3(1, 0, 0);
const _steerAxis = new THREE.Vector3(0, 1, 0);
const _spinQuat = new THREE.Quaternion();
const _steerQuat = new THREE.Quaternion();

export class GLTFTruckModel {
  public group: THREE.Group;
  public isLoaded: boolean = false;
  public chassisMesh: THREE.Object3D | null = null;
  public axles: AxleNode[] = [];
  public bulbMaterial: THREE.MeshStandardMaterial | null = null;

  constructor() {
    this.group = new THREE.Group();
  }

  public async loadModel(path: string = '/assets/models/dakar_truck.glb'): Promise<boolean> {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(path);
      const root = gltf.scene;

      // Enable shadows and enhance PBR materials
      root.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.roughness = Math.min(mat.roughness, 0.7);
            mat.envMapIntensity = 1.35;
            if (mat.name === 'CougarBulbs') {
              this.bulbMaterial = mat;
              mat.emissive = new THREE.Color(0xffbb77);
              mat.emissiveIntensity = 1.2;
            }
            mat.needsUpdate = true;
          }
        }
      });

      this.chassisMesh = root;
      this.group.add(this.chassisMesh);

      // Locate Axles: 'Wheels' (front), 'Wheels_mid', 'Wheels_rear'
      root.traverse((child) => {
        const name = child.name.toLowerCase();
        if (name === 'wheels' || name === 'wheels_mid' || name === 'wheels_rear') {
          let axleType: 'front' | 'mid' | 'rear' = 'front';
          if (name.includes('mid')) axleType = 'mid';
          else if (name.includes('rear')) axleType = 'rear';

          this.axles.push({
            node: child,
            initialPos: child.position.clone(),
            initialQuat: child.quaternion.clone(),
            axleType
          });
        }
      });

      this.isLoaded = true;
      console.log(`[GLTFTruckModel] Loaded 6x6 Heavy Dakar Truck (${path}) with ${this.axles.length} animated axle assemblies.`);
      return true;
    } catch (err) {
      console.warn(`[GLTFTruckModel] Model loading error for ${path}:`, err);
      return false;
    }
  }

  public update(vehicle: RaycastVehicle, isBraking: boolean) {
    if (!this.isLoaded || !this.chassisMesh) return;

    // 1. Sync Chassis Body Position & Rotation with Physics
    const trans = vehicle.chassisBody.translation();
    const rot = vehicle.chassisBody.rotation();
    _truckChassisQuat.set(rot.x, rot.y, rot.z, rot.w);
    _truckLocalOffset.set(-0.062, -1.32, 0.0).applyQuaternion(_truckChassisQuat);
    this.chassisMesh.position.set(trans.x + _truckLocalOffset.x, trans.y + _truckLocalOffset.y, trans.z + _truckLocalOffset.z);
    this.chassisMesh.quaternion.copy(_truckChassisQuat);

    // 2. Headlight / Brakelight glow response
    if (this.bulbMaterial) {
      if (isBraking) {
        this.bulbMaterial.emissive.setHex(0xff2211);
        this.bulbMaterial.emissiveIntensity = 3.5;
      } else {
        this.bulbMaterial.emissive.setHex(0xffeedd);
        this.bulbMaterial.emissiveIntensity = 1.4;
      }
    }

    // 3. Animate Axles (Steering, Wheel Spin, Suspension Compression)
    // 6-wheel layout: [0, 1] Front, [2, 3] Mid, [4, 5] Rear
    const has6Wheels = vehicle.wheels.length >= 6;

    const frontAvgSpin = has6Wheels
      ? (vehicle.wheels[0].rotationAngle + vehicle.wheels[1].rotationAngle) * 0.5
      : (vehicle.wheels[0].rotationAngle + vehicle.wheels[1].rotationAngle) * 0.5;

    const midAvgSpin = has6Wheels
      ? (vehicle.wheels[2].rotationAngle + vehicle.wheels[3].rotationAngle) * 0.5
      : (vehicle.wheels[2].rotationAngle + vehicle.wheels[3].rotationAngle) * 0.5;

    const rearAvgSpin = has6Wheels
      ? (vehicle.wheels[4].rotationAngle + vehicle.wheels[5].rotationAngle) * 0.5
      : (vehicle.wheels[2].rotationAngle + vehicle.wheels[3].rotationAngle) * 0.5;

    const frontCompression = has6Wheels
      ? (vehicle.wheels[0].compression + vehicle.wheels[1].compression) * 0.5
      : (vehicle.wheels[0].compression + vehicle.wheels[1].compression) * 0.5;

    const midCompression = has6Wheels
      ? (vehicle.wheels[2].compression + vehicle.wheels[3].compression) * 0.5
      : (vehicle.wheels[2].compression + vehicle.wheels[3].compression) * 0.5;

    const rearCompression = has6Wheels
      ? (vehicle.wheels[4].compression + vehicle.wheels[5].compression) * 0.5
      : (vehicle.wheels[2].compression + vehicle.wheels[3].compression) * 0.5;

    for (const axle of this.axles) {
      let spinAngle = frontAvgSpin;
      let suspCompression = frontCompression;

      if (axle.axleType === 'mid') {
        spinAngle = midAvgSpin;
        suspCompression = midCompression;
      } else if (axle.axleType === 'rear') {
        spinAngle = rearAvgSpin;
        suspCompression = rearCompression;
      }

      // Suspension bounce along local Y of the chassis
      const suspDelta = suspCompression * 0.75;
      axle.node.position.y = axle.initialPos.y + suspDelta;

      // Wheel Spin around local X axis
      _spinQuat.setFromAxisAngle(_spinAxis, spinAngle);

      if (axle.axleType === 'front') {
        // Front Axle Steers around Y axis and spins around X axis
        _steerQuat.setFromAxisAngle(_steerAxis, vehicle.currentSteer);
        axle.node.quaternion.copy(_steerQuat).multiply(_spinQuat).multiply(axle.initialQuat);
      } else {
        // Rear Tandem Axles Spin around X axis
        axle.node.quaternion.copy(_spinQuat).multiply(axle.initialQuat);
      }
    }
  }
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RaycastVehicle } from './RaycastVehicle';

interface AxleNode {
  node: THREE.Object3D;
  initialPos: THREE.Vector3;
  initialQuat: THREE.Quaternion;
  isFront: boolean;
}

export class GLTFTruckModel {
  public group: THREE.Group;
  public isLoaded: boolean = false;
  public chassisMesh: THREE.Object3D | null = null;
  public axles: AxleNode[] = [];

  constructor() {
    this.group = new THREE.Group();
  }

  public async loadModel(path: string = '/assets/models/dakar_truck.glb'): Promise<boolean> {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(path);
      const root = gltf.scene;

      // Enable shadows and PBR reflections
      root.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.roughness = Math.min(mat.roughness, 0.65);
            mat.envMapIntensity = 1.2;
            mat.needsUpdate = true;
          }
        }
      });

      this.chassisMesh = root;
      this.group.add(this.chassisMesh);

      // Locate Axles: 'Wheels' (front), 'Wheels_mid', 'Wheels_rear'
      root.traverse((child) => {
        const name = child.name.toLowerCase();
        if (name.includes('wheels') || name.includes('wheel') || name.includes('tire')) {
          const isFront = name === 'wheels' || name.includes('front');
          this.axles.push({
            node: child,
            initialPos: child.position.clone(),
            initialQuat: child.quaternion.clone(),
            isFront
          });
        }
      });

      this.isLoaded = true;
      console.log(`[GLTFTruckModel] Loaded 6x6 Heavy Truck Model (${path}) with ${this.axles.length} animated axle assemblies.`);
      return true;
    } catch (err) {
      console.warn(`[GLTFTruckModel] Model loading error for ${path}:`, err);
      return false;
    }
  }

  public update(vehicle: RaycastVehicle, isBraking: boolean) {
    if (!this.isLoaded || !this.chassisMesh) return;

    // 1. Sync Chassis Body Position & Rotation with Physics
    // Apply local offset rotated by chassis orientation so the model pivots around the true center of mass
    const trans = vehicle.chassisBody.translation();
    const rot = vehicle.chassisBody.rotation();
    const chassisQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const localOffset = new THREE.Vector3(0, -1.48, 0.22).applyQuaternion(chassisQuat);
    this.chassisMesh.position.set(trans.x + localOffset.x, trans.y + localOffset.y, trans.z + localOffset.z);
    this.chassisMesh.quaternion.copy(chassisQuat);

    // 2. Animate Axles (Steering, Wheel Spin, Suspension Compression)
    const frontAvgSpin = (vehicle.wheels[0].rotationAngle + vehicle.wheels[1].rotationAngle) * 0.5;
    const rearAvgSpin = (vehicle.wheels[2].rotationAngle + vehicle.wheels[3].rotationAngle) * 0.5;

    const frontSuspCompression = (vehicle.wheels[0].compression + vehicle.wheels[1].compression) * 0.5;
    const rearSuspCompression = (vehicle.wheels[2].compression + vehicle.wheels[3].compression) * 0.5;

    for (const axle of this.axles) {
      // Suspension bounce along local Y
      const suspDelta = axle.isFront ? frontSuspCompression * 0.7 : rearSuspCompression * 0.7;
      axle.node.position.y = axle.initialPos.y + suspDelta;

      // Wheel Spin & Steering Rotations
      const spinAngle = axle.isFront ? frontAvgSpin : rearAvgSpin;
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spinAngle);

      if (axle.isFront) {
        // Front Axle Steers
        const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.currentSteer);
        axle.node.quaternion.copy(axle.initialQuat).multiply(steerQuat).multiply(spinQuat);
      } else {
        // Rear Tandem Axles Spin
        axle.node.quaternion.copy(axle.initialQuat).multiply(spinQuat);
      }
    }
  }
}

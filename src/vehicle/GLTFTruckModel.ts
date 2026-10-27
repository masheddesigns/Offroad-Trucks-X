import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RaycastVehicle } from './RaycastVehicle';

interface WheelNode {
  group: THREE.Group;
  initialPos: THREE.Vector3;
  wheelIndex: number;
  isFront: boolean;
}

// Reusable static scratch objects to eliminate GC allocations
const _chassisQuat = new THREE.Quaternion();
const _chassisOffset = new THREE.Vector3();
const _spinAxis = new THREE.Vector3(1, 0, 0);
const _steerAxis = new THREE.Vector3(0, 0, 1); // In MAZ local coordinates, Z is vertical up
const _spinQuat = new THREE.Quaternion();
const _steerQuat = new THREE.Quaternion();

export class GLTFTruckModel {
  public group: THREE.Group;
  public isLoaded: boolean = false;
  public chassisMesh: THREE.Object3D | null = null;
  public wheelNodes: WheelNode[] = [];
  public opticsMaterial: THREE.MeshStandardMaterial | null = null;
  public isMazDakar: boolean = false;

  constructor() {
    this.group = new THREE.Group();
  }

  public async loadModel(path: string = '/assets/models/maz_6440rr_dakar.glb'): Promise<boolean> {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(path);
      const root = gltf.scene;

      // Detect MAZ-6440RR Dakar Model
      let mazRoot: THREE.Object3D | null = null;
      root.traverse((node) => {
        if (node.name.toLowerCase().includes('maz_6440rr')) {
          mazRoot = node;
        }
      });

      if (mazRoot) {
        this.isMazDakar = true;
        this.setupMazDakarModel(root, mazRoot);
      } else {
        // Fallback generic hierarchy
        this.setupGenericModel(root);
      }

      this.chassisMesh = root;
      this.group.add(this.chassisMesh);
      this.isLoaded = true;

      console.log(
        `[GLTFTruckModel] Successfully loaded authentic Dakar Truck (${path}) with ${this.wheelNodes.length} animated wheel assemblies.`
      );
      return true;
    } catch (err) {
      console.warn(`[GLTFTruckModel] Model loading error for ${path}:`, err);
      return false;
    }
  }

  /**
   * Sets up authentic MAZ-6440RR Dakar rally truck:
   * - Enhances PBR materials (windshield glass, rally paint, optics)
   * - Splits monolithic wheels & tires into 4 independent wheel groups (FL, FR, RL, RR)
   */
  private setupMazDakarModel(root: THREE.Object3D, mazGroup: THREE.Object3D) {
    let rimsMesh: THREE.Mesh | null = null;
    let tiresMesh: THREE.Mesh | null = null;

    mazGroup.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const matName = mat.name.toLowerCase();

          // 1. Optics & Headlights
          if (matName.includes('optics')) {
            this.opticsMaterial = mat;
            mat.emissive = new THREE.Color(0xffeedd);
            mat.emissiveIntensity = 1.6;
          }
          // 2. Windshield & Cabin Glass
          else if (matName.includes('glass')) {
            mat.transparent = true;
            mat.opacity = 0.55;
            mat.roughness = 0.08;
            mat.metalness = 0.9;
          }
          // 3. Body Paint & Liveries
          else if (matName.includes('body') || matName.includes('fill')) {
            mat.roughness = Math.min(mat.roughness, 0.45);
            mat.envMapIntensity = 1.4;
          }
          // 4. Identify Rims & Tires for dynamic wheel splitting
          else if (matName.includes('wheels')) {
            rimsMesh = mesh;
          } else if (matName.includes('banda') || matName.includes('tyre')) {
            tiresMesh = mesh;
          }

          mat.needsUpdate = true;
        }
      }
    });

    // 4 Wheels Configuration: Front Left/Right, Rear Left/Right
    // Coordinates in MAZ local space (Blender coords: X lateral, Y longitudinal, Z vertical)
    const wheelConfigs = [
      { name: 'Wheel_FL', index: 0, isFront: true, center: new THREE.Vector3(-1.06, 2.16, -0.65), pred: (x: number, y: number) => y > 0 && x < 0 },
      { name: 'Wheel_FR', index: 1, isFront: true, center: new THREE.Vector3(1.06, 2.16, -0.65), pred: (x: number, y: number) => y > 0 && x > 0 },
      { name: 'Wheel_RL', index: 2, isFront: false, center: new THREE.Vector3(-1.06, -2.14, -0.65), pred: (x: number, y: number) => y < 0 && x < 0 },
      { name: 'Wheel_RR', index: 3, isFront: false, center: new THREE.Vector3(1.06, -2.14, -0.65), pred: (x: number, y: number) => y < 0 && x > 0 }
    ];

    if (rimsMesh && tiresMesh) {
      for (const cfg of wheelConfigs) {
        const wheelGroup = new THREE.Group();
        wheelGroup.name = cfg.name;
        wheelGroup.position.copy(cfg.center);

        // Slice Rims
        const rimGeom = this.sliceGeometry((rimsMesh as THREE.Mesh).geometry, cfg.pred, cfg.center);
        const rimSubMesh = new THREE.Mesh(rimGeom, (rimsMesh as THREE.Mesh).material);
        rimSubMesh.castShadow = true;
        rimSubMesh.receiveShadow = true;
        wheelGroup.add(rimSubMesh);

        // Slice Tires
        const tireGeom = this.sliceGeometry((tiresMesh as THREE.Mesh).geometry, cfg.pred, cfg.center);
        const tireSubMesh = new THREE.Mesh(tireGeom, (tiresMesh as THREE.Mesh).material);
        tireSubMesh.castShadow = true;
        tireSubMesh.receiveShadow = true;
        wheelGroup.add(tireSubMesh);

        mazGroup.add(wheelGroup);

        this.wheelNodes.push({
          group: wheelGroup,
          initialPos: cfg.center.clone(),
          wheelIndex: cfg.index,
          isFront: cfg.isFront
        });
      }

      // Detach the monolithic source meshes so only independent wheels render
      mazGroup.remove(rimsMesh);
      mazGroup.remove(tiresMesh);
    }
  }

  /**
   * Sub-slices geometry into isolated wheel objects offset to local (0,0,0)
   */
  private sliceGeometry(
    sourceGeom: THREE.BufferGeometry,
    predicate: (x: number, y: number) => boolean,
    offset: THREE.Vector3
  ): THREE.BufferGeometry {
    const posAttr = sourceGeom.getAttribute('position');
    const normAttr = sourceGeom.getAttribute('normal');
    const uvAttr = sourceGeom.getAttribute('uv');
    const index = sourceGeom.getIndex();

    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];
    const newIndices: number[] = [];
    const indexMap = new Map<number, number>();

    const triCount = index ? index.count / 3 : posAttr.count / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      const x0 = posAttr.getX(i0), y0 = posAttr.getY(i0);
      const x1 = posAttr.getX(i1), y1 = posAttr.getY(i1);
      const x2 = posAttr.getX(i2), y2 = posAttr.getY(i2);

      const cx = (x0 + x1 + x2) / 3;
      const cy = (y0 + y1 + y2) / 3;

      if (!predicate(cx, cy)) continue;

      [i0, i1, i2].forEach((oldIdx) => {
        let newIdx = indexMap.get(oldIdx);
        if (newIdx === undefined) {
          newIdx = newPositions.length / 3;
          indexMap.set(oldIdx, newIdx);

          newPositions.push(
            posAttr.getX(oldIdx) - offset.x,
            posAttr.getY(oldIdx) - offset.y,
            posAttr.getZ(oldIdx) - offset.z
          );

          if (normAttr) {
            newNormals.push(normAttr.getX(oldIdx), normAttr.getY(oldIdx), normAttr.getZ(oldIdx));
          }
          if (uvAttr) {
            newUvs.push(uvAttr.getX(oldIdx), uvAttr.getY(oldIdx));
          }
        }
        newIndices.push(newIdx);
      });
    }

    const subGeom = new THREE.BufferGeometry();
    subGeom.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) subGeom.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    if (newUvs.length > 0) subGeom.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    subGeom.setIndex(newIndices);
    return subGeom;
  }

  private setupGenericModel(root: THREE.Object3D) {
    root.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }

  public update(vehicle: RaycastVehicle, isBraking: boolean) {
    if (!this.isLoaded || !this.chassisMesh) return;

    // 1. Sync Chassis Body Position & Rotation with Physics
    const trans = vehicle.chassisBody.translation();
    const rot = vehicle.chassisBody.rotation();
    _chassisQuat.set(rot.x, rot.y, rot.z, rot.w);

    // Height alignment: align chassis body perfectly with tire radius and suspension
    _chassisOffset.set(0.0, -0.65, 0.0).applyQuaternion(_chassisQuat);
    this.chassisMesh.position.set(
      trans.x + _chassisOffset.x,
      trans.y + _chassisOffset.y,
      trans.z + _chassisOffset.z
    );
    this.chassisMesh.quaternion.copy(_chassisQuat);

    // 2. Optics & Brakelight Glow
    if (this.opticsMaterial) {
      if (isBraking) {
        this.opticsMaterial.emissive.setHex(0xff1100);
        this.opticsMaterial.emissiveIntensity = 3.5;
      } else {
        this.opticsMaterial.emissive.setHex(0xffeedd);
        this.opticsMaterial.emissiveIntensity = 1.4;
      }
    }

    // 3. Animate Independent Wheels (Steer, Rolling Spin, Suspension Compression)
    for (const wn of this.wheelNodes) {
      const wheelState = vehicle.wheels[wn.wheelIndex];
      if (!wheelState) continue;

      // Suspension travel in MAZ local space (along Z axis)
      wn.group.position.z = wn.initialPos.z - wheelState.compression * 0.4;

      // Wheel Spin around local X axis
      _spinQuat.setFromAxisAngle(_spinAxis, wheelState.rotationAngle);

      if (wn.isFront) {
        // Front Wheels: Steer around vertical Z axis and roll around X axis
        _steerQuat.setFromAxisAngle(_steerAxis, vehicle.currentSteer);
        wn.group.quaternion.copy(_steerQuat).multiply(_spinQuat);
      } else {
        // Rear Wheels: Roll around X axis
        wn.group.quaternion.copy(_spinQuat);
      }
    }
  }
}

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ProceduralTextures } from './ProceduralTextures';

export class RallyStageMap {
  public mesh: THREE.Group;
  private rapier: typeof RAPIER;
  private world: RAPIER.World;

  constructor(rapier: typeof RAPIER, world: RAPIER.World) {
    this.rapier = rapier;
    this.world = world;
    this.mesh = new THREE.Group();

    this.buildTerrain();
    this.buildRallyProps();
  }

  private buildTerrain() {
    const size = 500;
    const segs = 140;

    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const sandColor = new THREE.Color(0xd29753);
    const canyonRockColor = new THREE.Color(0x7c432d); // Red Sandstone
    const roadColor = new THREE.Color(0x3e352c); // Packed dirt track

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      let y = 0;
      const distFromCenter = Math.sqrt(x * x + z * z);
      const edgeDist = Math.max(Math.abs(x), Math.abs(z));

      // 1. Boundary Enclosing Canyon Walls (50 meters high!)
      if (edgeDist > 180) {
        const wallFactor = (edgeDist - 180) / 70.0;
        y = Math.pow(wallFactor, 1.8) * 55.0 + Math.sin(x * 0.1) * Math.cos(z * 0.1) * 6.0;
      } else {
        // 2. Interior Rally Stage Landscape
        // The Start & Staging Pad (Flat & smooth)
        if (Math.abs(x) < 22 && Math.abs(z) < 22) {
          y = 0;
        } else if (x > 35) {
          // East: Giant Dakar Sand Dunes
          const dX = x - 35;
          y = Math.sin(dX * 0.04 + z * 0.03) * 6.5 +
              Math.cos(dX * 0.02 - z * 0.02) * 8.0 +
              Math.sin(z * 0.07) * 2.5;

          // Huge Mega Jump Dune
          if (x > 90 && x < 140 && Math.abs(z) < 35) {
            y += Math.sin((x - 90) / 50 * Math.PI) * 14.0;
          }
        } else if (x < -35) {
          // West: The Devil's Gorge (Deep canyon ravine & rocky stepped ascents)
          const dX = Math.abs(x + 35);
          y = Math.sin(z * 0.04) * 5.0 + Math.floor(dX * 0.22) * 4.0;
          // Ravine cut
          if (Math.abs(z) < 25) {
            y -= 8.0;
          }
        } else if (z < -35) {
          // South: Washboard trails & corrugated jumps
          y = Math.sin(z * 0.25) * 1.8 + Math.cos(x * 0.08) * 4.0;
        } else {
          // Gentle desert transitions
          y = Math.sin(x * 0.03) * Math.cos(z * 0.03) * 3.0;
        }
      }

      pos.setY(i, y);

      // Vertex color blending
      const col = new THREE.Color();
      if (y > 18) {
        col.copy(canyonRockColor).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
      } else if (distFromCenter < 20) {
        col.copy(roadColor);
      } else {
        col.copy(sandColor).offsetHSL(0, 0, (y / 20) * 0.12);
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const { diffuse, normal } = ProceduralTextures.createSandTextures();

    const mat = new THREE.MeshStandardMaterial({
      map: diffuse,
      normalMap: normal,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.12
    });

    const terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    this.mesh.add(terrainMesh);

    // Build Rapier Trimesh Collider
    const vertices = new Float32Array(pos.array);
    const indices = new Uint32Array(geo.index!.array);

    const bodyDesc = this.rapier.RigidBodyDesc.fixed();
    const terrainBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.85);

    this.world.createCollider(colliderDesc, terrainBody);
  }

  private buildRallyProps() {
    // 1. Dakar Start / Finish Gantry Arch
    this.createRallyGantry(new THREE.Vector3(0, 0, 15), 'STAGE 1 START');
    this.createRallyGantry(new THREE.Vector3(120, 8, 0), 'CHECKPOINT 1');
    this.createRallyGantry(new THREE.Vector3(-80, 4, 0), 'DEVIL GORGE');

    // 2. Giant Jump Launch & Landing Ramps
    this.createLaunchRamp(new THREE.Vector3(0, 0, 55), 10, 5, 22, 0.38);
    this.createLaunchRamp(new THREE.Vector3(85, 6, 0), 12, 7, 26, 0.42);

    // 3. Instanced Desert Boulders (120 natural rock obstacles scattered along canyon edges)
    this.createInstancedBoulders();

    // 4. Rally Turn Warning Signs (Chevrons)
    this.createChevronSign(new THREE.Vector3(-18, 0, 40), 0.4);
    this.createChevronSign(new THREE.Vector3(18, 0, 40), -0.4);
    this.createChevronSign(new THREE.Vector3(45, 2, 70), 0.8);
    this.createChevronSign(new THREE.Vector3(-45, 2, 70), -0.8);

    // 5. Tire Barrier Stacks
    this.createTireBarrier(new THREE.Vector3(-22, 0, 25));
    this.createTireBarrier(new THREE.Vector3(22, 0, 25));
  }

  private createRallyGantry(pos: THREE.Vector3, text: string) {
    const group = new THREE.Group();

    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.9,
      roughness: 0.3
    });

    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0xff5500, // Dakar Orange
      emissive: 0xcc3300,
      emissiveIntensity: 0.8,
      roughness: 0.4
    });

    // Left & Right Support Pillars
    const pillarGeo = new THREE.BoxGeometry(0.6, 9.0, 0.6);
    const pL = new THREE.Mesh(pillarGeo, trussMat);
    pL.position.set(-7.0, 4.5, 0);
    pL.castShadow = true;

    const pR = pL.clone();
    pR.position.x = 7.0;

    // Crossbar Arch
    const crossGeo = new THREE.BoxGeometry(14.6, 0.8, 0.8);
    const cross = new THREE.Mesh(crossGeo, trussMat);
    cross.position.set(0, 8.8, 0);
    cross.castShadow = true;

    // Hanging Dakar Banner
    const bannerGeo = new THREE.BoxGeometry(11.0, 1.8, 0.15);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 7.6, 0);

    group.add(pL, pR, cross, banner);
    group.position.copy(pos);
    this.mesh.add(group);

    // Physics Colliders for Pillars
    const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    const body = this.world.createRigidBody(bodyDesc);

    const colL = this.rapier.ColliderDesc.cuboid(0.3, 4.5, 0.3).setTranslation(-7.0, 4.5, 0);
    const colR = this.rapier.ColliderDesc.cuboid(0.3, 4.5, 0.3).setTranslation(7.0, 4.5, 0);
    this.world.createCollider(colL, body);
    this.world.createCollider(colR, body);
  }

  private createLaunchRamp(pos: THREE.Vector3, width: number, height: number, length: number, angleX: number) {
    const rampGroup = new THREE.Group();
    const geo = new THREE.BoxGeometry(width, 0.6, length);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      roughness: 0.5,
      metalness: 0.6
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rampGroup.add(mesh);

    rampGroup.position.copy(pos);
    rampGroup.position.y += (height * 0.5);
    rampGroup.rotation.x = angleX;
    this.mesh.add(rampGroup);

    // Physics
    const bodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(rampGroup.position.x, rampGroup.position.y, rampGroup.position.z)
      .setRotation(new THREE.Quaternion().setFromEuler(rampGroup.rotation));
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.cuboid(width * 0.5, 0.3, length * 0.5)
      .setFriction(0.95);
    this.world.createCollider(colliderDesc, body);
  }

  private createInstancedBoulders() {
    const count = 120;
    const geo = new THREE.DodecahedronGeometry(1.5, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8b5a3c, // Weathered canyon sandstone
      roughness: 0.9,
      metalness: 0.1
    });

    const instancedMesh = new THREE.InstancedMesh(geo, mat, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      // Scatter in clusters along canyon ridges (dist 60 to 170)
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 55 + Math.random() * 110;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = Math.random() * 8.0 + 1.0;
      const scale = 1.0 + Math.random() * 2.5;

      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.scale.set(scale, scale * (0.8 + Math.random() * 0.4), scale);
      dummy.updateMatrix();

      instancedMesh.setMatrixAt(i, dummy.matrix);

      // Add Rapier Ball Collider for each boulder
      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, y, z);
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.ball(scale * 1.3);
      this.world.createCollider(col, body);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(instancedMesh);
  }

  private createChevronSign(pos: THREE.Vector3, rotY: number) {
    const group = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 1.6;

    const signGeo = new THREE.BoxGeometry(1.6, 1.2, 0.08);
    const signMat = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xaa2200,
      emissiveIntensity: 0.5
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.y = 2.4;

    group.add(post, sign);
    group.position.copy(pos);
    group.rotation.y = rotY;
    this.mesh.add(group);
  }

  private createTireBarrier(pos: THREE.Vector3) {
    const group = new THREE.Group();
    const tireGeo = new THREE.TorusGeometry(0.5, 0.22, 8, 16);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });

    for (let tz = -3; tz <= 3; tz += 1.1) {
      for (let ty = 0; ty <= 1; ty++) {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.position.set(0, 0.5 + ty * 0.8, tz);
        tire.rotation.y = Math.PI / 2;
        tire.castShadow = true;
        group.add(tire);
      }
    }
    group.position.copy(pos);
    this.mesh.add(group);
  }
}

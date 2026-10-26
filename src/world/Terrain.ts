import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export class Terrain {
  public mesh: THREE.Group;
  private rapier: typeof RAPIER;
  private world: RAPIER.World;

  constructor(rapier: typeof RAPIER, world: RAPIER.World) {
    this.rapier = rapier;
    this.world = world;
    this.mesh = new THREE.Group();

    this.buildTerrain();
    this.buildObstacles();
  }

  private buildTerrain() {
    const width = 300;
    const depth = 300;
    const segs = 120;

    const geo = new THREE.PlaneGeometry(width, depth, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Color palettes
    const sandColor = new THREE.Color(0xd49b57); // Warm Desert Sand
    const rockColor = new THREE.Color(0x6e6359); // Rocky Canyon Grey
    const asphaltColor = new THREE.Color(0x2a2a30); // Starting Pad / Road

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      let y = 0;

      // Center Runway & Starting Area (Smooth & flat)
      const distFromCenter = Math.sqrt(x * x + z * z);

      if (distFromCenter < 25) {
        y = 0; // Flat spawn zone
      } else if (x > 30) {
        // ZONE A: Desert Sand Dunes & High Speed Crests
        const dX = x - 30;
        y = Math.sin(dX * 0.05 + z * 0.04) * 4.5 +
            Math.cos(dX * 0.02 - z * 0.03) * 6.0 +
            Math.sin(z * 0.08) * 1.5;
        // Big launch dune at the far east
        if (x > 80 && x < 120 && Math.abs(z) < 30) {
          y += Math.sin((x - 80) / 40 * Math.PI) * 12.0;
        }
      } else if (x < -30) {
        // ZONE B: Rocky Mountain Steppes & Sharp Inclines
        const dX = Math.abs(x + 30);
        y = Math.floor(dX * 0.25) * 2.5 + Math.sin(z * 0.1) * 2.0;
        if (z > 40) {
          y += Math.sin(dX * 0.1) * 8.0;
        }
      } else if (z < -30) {
        // ZONE C: Junkyard & Bumpy Washboard Terrain
        y = (Math.sin(x * 0.3) * Math.cos(z * 0.3)) * 1.8 +
            Math.sin(z * 0.8) * 0.6; // Washboard stutter bumps
      } else {
        // Transitional gentle slopes
        y = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 2.0;
      }

      pos.setY(i, y);

      // Vertex Coloring based on height and zone
      const col = new THREE.Color();
      if (distFromCenter < 25) {
        col.copy(asphaltColor);
      } else if (x < -30) {
        col.copy(rockColor).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
      } else {
        col.copy(sandColor).offsetHSL(0, 0, (y / 20) * 0.15);
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.1
    });

    const terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    this.mesh.add(terrainMesh);

    // Build Rapier Trimesh Collider from Geometry
    const vertices = new Float32Array(pos.array);
    const indices = new Uint32Array(geo.index!.array);

    const bodyDesc = this.rapier.RigidBodyDesc.fixed();
    const terrainBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.8)
      .setRestitution(0.0);

    this.world.createCollider(colliderDesc, terrainBody);
  }

  private buildObstacles() {
    // 1. Mega Dakar Launch Ramp (on the desert runway)
    this.createRamp(new THREE.Vector3(0, 0, 45), 8, 4, 18, 0.35);

    // 2. High-speed Stunt Gap Ramps
    this.createRamp(new THREE.Vector3(70, 4, 0), 10, 6, 22, 0.45);
    this.createRamp(new THREE.Vector3(120, 4, 0), 10, 6, 22, -0.45); // Landing ramp

    // 3. Shipping Containers in the Junkyard Zone (z < -40)
    const containerColors = [0xb83227, 0x2475b0, 0x2e86de, 0xe71c23];
    const containerPositions = [
      { x: -12, y: 1.5, z: -55, rotY: 0.2 },
      { x: -18, y: 1.5, z: -52, rotY: -0.4 },
      { x: -15, y: 4.5, z: -54, rotY: 0.05 }, // Stacked container!
      { x: 10, y: 1.5, z: -60, rotY: 0.8 },
      { x: 18, y: 1.5, z: -58, rotY: 0.5 },
      { x: 0, y: 1.5, z: -75, rotY: 1.57 }
    ];

    containerPositions.forEach((cp, idx) => {
      this.createContainer(
        new THREE.Vector3(cp.x, cp.y, cp.z),
        12, 3, 3,
        cp.rotY,
        containerColors[idx % containerColors.length]
      );
    });

    // 4. Large Pipe Obstacle Tunnel
    this.createPipeTunnel(new THREE.Vector3(-10, 2.5, -90), 4.5, 25);
  }

  private createRamp(pos: THREE.Vector3, width: number, height: number, length: number, angleX: number) {
    const rampGroup = new THREE.Group();
    const geo = new THREE.BoxGeometry(width, 0.5, length);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      metalness: 0.5,
      roughness: 0.4
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rampGroup.add(mesh);

    rampGroup.position.copy(pos);
    rampGroup.position.y += (height / 2);
    rampGroup.rotation.x = angleX;
    this.mesh.add(rampGroup);

    // Physics
    const bodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(rampGroup.position.x, rampGroup.position.y, rampGroup.position.z)
      .setRotation(new THREE.Quaternion().setFromEuler(rampGroup.rotation));
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.cuboid(width / 2, 0.25, length / 2)
      .setFriction(0.9);
    this.world.createCollider(colliderDesc, body);
  }

  private createContainer(pos: THREE.Vector3, length: number, width: number, height: number, rotY: number, color: number) {
    const geo = new THREE.BoxGeometry(width, height, length);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.4
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh.add(mesh);

    // Physics
    const bodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)));
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.cuboid(width / 2, height / 2, length / 2)
      .setFriction(0.7);
    this.world.createCollider(colliderDesc, body);
  }

  private createPipeTunnel(pos: THREE.Vector3, radius: number, length: number) {
    const geo = new THREE.CylinderGeometry(radius, radius, length, 16, 1, true);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x555c66,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0.5
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh.add(mesh);

    // Physics: Trimesh for hollow cylinder
    const posAttr = geo.attributes.position;
    const indices = geo.index!.array;
    const vertices = new Float32Array(posAttr.array);

    // Apply rotation to vertices
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    for (let i = 0; i < vertices.length; i += 3) {
      const v = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]).applyQuaternion(q);
      vertices[i] = v.x;
      vertices[i + 1] = v.y;
      vertices[i + 2] = v.z;
    }

    const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    const body = this.world.createRigidBody(bodyDesc);
    const collider = this.rapier.ColliderDesc.trimesh(vertices, new Uint32Array(indices));
    this.world.createCollider(collider, body);
  }
}

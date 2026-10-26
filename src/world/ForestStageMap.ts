import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export interface GasStationLocation {
  pos: THREE.Vector3;
  radius: number;
}

export class ForestStageMap {
  public mesh: THREE.Group;
  public gasStations: GasStationLocation[] = [];
  private rapier: typeof RAPIER;
  private world: RAPIER.World;

  constructor(rapier: typeof RAPIER, world: RAPIER.World) {
    this.rapier = rapier;
    this.world = world;
    this.mesh = new THREE.Group();

    this.buildTerrain();
    this.buildPineForest();
    this.buildGasStations();
    this.buildForestObstacles();
  }

  private buildTerrain() {
    const size = 520;
    const segs = 140;

    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Forest Color Palette
    const grassColor = new THREE.Color(0x3a5a2a); // Deep Forest Green Moss/Grass
    const mudColor = new THREE.Color(0x423223); // Wet Mud Road
    const rockColor = new THREE.Color(0x555047); // Mountain Rock
    const asphaltColor = new THREE.Color(0x282a2e); // Gas Station Pad

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      let y = 0;
      const distFromCenter = Math.sqrt(x * x + z * z);
      const edgeDist = Math.max(Math.abs(x), Math.abs(z));

      // 1. Surrounding Mountain Ridges enclosing the forest valley
      if (edgeDist > 180) {
        const wallFactor = (edgeDist - 180) / 75.0;
        y = Math.pow(wallFactor, 1.8) * 45.0 + Math.sin(x * 0.08) * Math.cos(z * 0.08) * 6.0;
      } else {
        // Flat Staging & Gas Station Area
        if (Math.abs(x - 15) < 30 && Math.abs(z) < 25) {
          y = 0.0;
        } else if (x > 40) {
          // East: Rolling Pine Hills & Mud Ridges
          y = Math.sin(x * 0.035 + z * 0.03) * 7.5 +
              Math.cos(x * 0.015 - z * 0.02) * 5.0 +
              Math.sin(z * 0.08) * 2.0;
        } else if (x < -40) {
          // West: Forest Creek Ravine & Deep Mud Gully
          y = Math.sin(z * 0.03) * 6.0 + Math.sin(x * 0.05) * 4.0;
          if (Math.abs(z) < 28) {
            y -= 6.5; // Creek depression
          }
        } else if (z < -35) {
          // North: Undulating Logging Trail
          y = Math.sin(z * 0.04) * 5.0 + Math.cos(x * 0.05) * 4.0;
        } else {
          y = Math.sin(x * 0.03) * Math.cos(z * 0.03) * 2.5;
        }
      }

      pos.setY(i, y);

      // Vertex Coloring
      const col = new THREE.Color();
      if (Math.abs(x - 22) < 18 && Math.abs(z) < 16) {
        col.copy(asphaltColor); // Gas station pad
      } else if (y > 18) {
        col.copy(rockColor); // High ridges
      } else if (distFromCenter < 28 || (Math.abs(x) < 8 && z > 0)) {
        col.copy(mudColor); // Dirt trail
      } else {
        // Natural mossy woodland floor
        col.copy(grassColor).offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.06);
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1
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
      .setFriction(0.8);

    this.world.createCollider(colliderDesc, terrainBody);
  }

  /**
   * Instanced Dense Multi-Tiered Pine Forest (Realistic Branch Architecture)
   */
  private buildPineForest() {
    const treeCount = 240;

    // Build Realistic 4-Tier Branch Cluster Geometry
    const branchGeos: THREE.BufferGeometry[] = [];
    const tierParams = [
      { radius: 3.8, height: 3.2, y: 3.5 },
      { radius: 3.1, height: 2.8, y: 5.5 },
      { radius: 2.3, height: 2.5, y: 7.2 },
      { radius: 1.5, height: 2.2, y: 8.8 },
      { radius: 0.8, height: 1.8, y: 10.0 }
    ];

    tierParams.forEach((t) => {
      const cone = new THREE.ConeGeometry(t.radius, t.height, 9);
      cone.translate(0, t.y, 0);
      branchGeos.push(cone);
    });

    // Merge tiers into a single complex evergreen branch canopy
    const mergedPineGeo = new THREE.BufferGeometry();
    let totalVerts = 0;
    branchGeos.forEach(g => { totalVerts += g.attributes.position.count; });
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);

    let offset = 0;
    branchGeos.forEach(g => {
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      positions.set(p, offset * 3);
      normals.set(n, offset * 3);
      offset += g.attributes.position.count;
    });

    mergedPineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mergedPineGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    const pineMat = new THREE.MeshStandardMaterial({
      color: 0x18331a, // Dark Pacific Northwest Pine Green
      roughness: 0.75,
      metalness: 0.08
    });
    const foliageMesh = new THREE.InstancedMesh(mergedPineGeo, pineMat, treeCount);
    foliageMesh.castShadow = true;
    foliageMesh.receiveShadow = true;

    // Wood Bark Trunk Geometry
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 5.5, 8);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x2b1e15, // Rough Dark Pine Bark
      roughness: 0.95,
      metalness: 0.05
    });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();

    let placed = 0;
    while (placed < treeCount) {
      const x = (Math.random() - 0.5) * 380;
      const z = (Math.random() - 0.5) * 380;

      // Avoid road & gas station
      if (Math.abs(x - 20) < 26 && Math.abs(z) < 26) continue;
      if (Math.abs(x) < 14 && Math.abs(z) < 70) continue;

      const scale = 0.85 + Math.random() * 0.55;
      const yOffset = Math.sin(x * 0.035 + z * 0.03) * 6.0;

      // Place Trunk
      dummy.position.set(x, yOffset + 2.75 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(placed, dummy.matrix);

      // Place Foliage
      dummy.position.set(x, yOffset, z);
      dummy.updateMatrix();
      foliageMesh.setMatrixAt(placed, dummy.matrix);

      // Add Physics Trunk Collider
      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, yOffset + 2.75 * scale, z);
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cylinder(2.75 * scale, 0.45 * scale);
      this.world.createCollider(col, body);

      placed++;
    }

    foliageMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(trunkMesh, foliageMesh);

    // Build Ground Fern & Grass Clumps
    this.buildGroundFoliage();
  }

  /**
   * 400+ Instanced Wild Grass and Fern Foliage along trail edges
   */
  private buildGroundFoliage() {
    const grassCount = 420;

    // Cross-quad grass tuft geometry
    const quad1 = new THREE.PlaneGeometry(1.6, 1.2);
    const quad2 = new THREE.PlaneGeometry(1.6, 1.2);
    quad2.rotateY(Math.PI / 2);

    const grassGeo = new THREE.BufferGeometry();
    const q1p = quad1.attributes.position.array;
    const q2p = quad2.attributes.position.array;
    const gPos = new Float32Array(q1p.length + q2p.length);
    gPos.set(q1p, 0);
    gPos.set(q2p, q1p.length);
    grassGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    grassGeo.computeVertexNormals();

    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x4a7332, // Vibrant Meadow / Fern Green
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    grassMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < grassCount; i++) {
      // Cluster along trail sides and tree bases
      const angle = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 140;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const yOffset = Math.sin(x * 0.035 + z * 0.03) * 6.0;

      dummy.position.set(x, yOffset + 0.6, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      const sc = 0.8 + Math.random() * 0.7;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();

      grassMesh.setMatrixAt(i, dummy.matrix);
    }

    grassMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(grassMesh);
  }

  /**
   * 3D Petrol Pump Stations
   */
  private buildGasStations() {
    // Main Trailhead Gas Station
    this.createPetrolStation(new THREE.Vector3(22, 0, 8), 'VALLEY FUEL • DIESEL');
    this.gasStations.push({ pos: new THREE.Vector3(22, 0, 8), radius: 8.5 });

    // Outpost Gas Station in Deep Forest
    this.createPetrolStation(new THREE.Vector3(-90, 2, -65), 'OUTPOST 2 • DIESEL');
    this.gasStations.push({ pos: new THREE.Vector3(-90, 2, -65), radius: 8.5 });
  }

  private createPetrolStation(pos: THREE.Vector3, stationName: string) {
    const station = new THREE.Group();

    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a, // Petrol Station Blue
      roughness: 0.3,
      metalness: 0.6
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.2,
      metalness: 0.9
    });

    const pumpMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Amber / Yellow Fuel Pump
      roughness: 0.3,
      metalness: 0.5
    });

    const signMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.8
    });

    // 1. Concrete Pump Island
    const islandGeo = new THREE.BoxGeometry(3.5, 0.35, 12.0);
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.y = 0.18;
    island.receiveShadow = true;
    station.add(island);

    // 2. Dual Digital Petrol Pumps
    for (let pz of [-3.2, 3.2]) {
      const pumpGroup = new THREE.Group();

      // Main Pump Body
      const bodyGeo = new THREE.BoxGeometry(1.2, 2.2, 0.9);
      const pumpBody = new THREE.Mesh(bodyGeo, pumpMat);
      pumpBody.position.y = 1.1;
      pumpBody.castShadow = true;

      // Digital Screen
      const screenGeo = new THREE.BoxGeometry(0.8, 0.45, 0.92);
      const screenMat = new THREE.MeshStandardMaterial({
        color: 0x059669,
        emissive: 0x10b981,
        emissiveIntensity: 1.5
      });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.y = 1.4;

      // Black Fuel Hoses
      const hoseGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
      const hoseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      const hoseL = new THREE.Mesh(hoseGeo, hoseMat);
      hoseL.position.set(-0.62, 1.0, 0);
      const hoseR = hoseL.clone();
      hoseR.position.x = 0.62;

      // Fuel Nozzles
      const nozzleGeo = new THREE.BoxGeometry(0.12, 0.3, 0.15);
      const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x22c55e });
      const nozL = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozL.position.set(-0.62, 1.2, 0);
      const nozR = nozL.clone();
      nozR.position.x = 0.62;

      pumpGroup.add(pumpBody, screen, hoseL, hoseR, nozL, nozR);
      pumpGroup.position.z = pz;
      station.add(pumpGroup);

      // Physics Collider for Fuel Pump
      const pBodyDesc = this.rapier.RigidBodyDesc.fixed()
        .setTranslation(pos.x, pos.y + 1.1, pos.z + pz);
      const pBody = this.world.createRigidBody(pBodyDesc);
      const col = this.rapier.ColliderDesc.cuboid(0.6, 1.1, 0.45);
      this.world.createCollider(col, pBody);
    }

    // 3. Overhead Station Canopy
    const roofGeo = new THREE.BoxGeometry(10.0, 0.6, 16.0);
    const roof = new THREE.Mesh(roofGeo, canopyMat);
    roof.position.y = 6.2;
    roof.castShadow = true;

    // Station Illuminated Fascia Sign
    const signGeo = new THREE.BoxGeometry(10.2, 0.8, 1.2);
    const signFront = new THREE.Mesh(signGeo, signMat);
    signFront.position.set(0, 6.2, 7.8);
    station.add(roof, signFront);

    // Canopy Steel Support Columns
    const colGeo = new THREE.CylinderGeometry(0.25, 0.25, 6.0, 12);
    for (let cx of [-3.8, 3.8]) {
      for (let cz of [-6.0, 6.0]) {
        const pillar = new THREE.Mesh(colGeo, steelMat);
        pillar.position.set(cx, 3.0, cz);
        pillar.castShadow = true;
        station.add(pillar);

        const colBodyDesc = this.rapier.RigidBodyDesc.fixed()
          .setTranslation(pos.x + cx, pos.y + 3.0, pos.z + cz);
        const colBody = this.world.createRigidBody(colBodyDesc);
        const cCol = this.rapier.ColliderDesc.cylinder(3.0, 0.25);
        this.world.createCollider(cCol, colBody);
      }
    }

    // Canopy Under-Lights (Fueling Bay Lighting)
    const bayLight = new THREE.PointLight(0xfffaed, 4.0, 22, 1.2);
    bayLight.position.set(0, 5.6, 0);
    bayLight.castShadow = true;
    station.add(bayLight);

    // Glowing Green Refueling Area Trigger Circle on Ground
    const triggerRingGeo = new THREE.RingGeometry(2.5, 3.0, 24);
    triggerRingGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const triggerRing = new THREE.Mesh(triggerRingGeo, ringMat);
    triggerRing.position.y = 0.22;
    station.add(triggerRing);

    station.position.copy(pos);
    this.mesh.add(station);
  }

  private buildForestObstacles() {
    // 1. Heavy Wooden Log Bridge over Creek Ravine
    this.createLogBridge(new THREE.Vector3(-40, -1.5, 0), 18, 5.5);

    // 2. Fallen Log Obstacles to Crawl Over
    this.createFallenLog(new THREE.Vector3(0, 0.5, 45), 12, 0.7, 0.2);
    this.createFallenLog(new THREE.Vector3(65, 3.0, -30), 10, 0.8, -0.4);
  }

  private createLogBridge(pos: THREE.Vector3, length: number, width: number) {
    const bridge = new THREE.Group();
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3219, roughness: 0.9 });

    // Parallel Logs forming bridge deck
    for (let lz = -length * 0.5; lz <= length * 0.5; lz += 0.55) {
      const logGeo = new THREE.CylinderGeometry(0.24, 0.24, width, 8);
      const log = new THREE.Mesh(logGeo, logMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(0, 0, lz);
      log.castShadow = true;
      log.receiveShadow = true;
      bridge.add(log);
    }

    bridge.position.copy(pos);
    this.mesh.add(bridge);

    // Physics
    const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    const body = this.world.createRigidBody(bodyDesc);
    const col = this.rapier.ColliderDesc.cuboid(width * 0.5, 0.25, length * 0.5)
      .setFriction(0.9);
    this.world.createCollider(col, body);
  }

  private createFallenLog(pos: THREE.Vector3, length: number, radius: number, rotY: number) {
    const logGeo = new THREE.CylinderGeometry(radius, radius, length, 12);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 });
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rotY;
    log.position.copy(pos);
    log.castShadow = true;
    log.receiveShadow = true;
    this.mesh.add(log);

    // Physics
    const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    const body = this.world.createRigidBody(bodyDesc);
    const col = this.rapier.ColliderDesc.cylinder(length * 0.5, radius);
    this.world.createCollider(col, body);
  }
}

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export interface GasStationLocation {
  pos: THREE.Vector3;
  radius: number;
}

export class ForestStageMap {
  public mesh: THREE.Group;
  public gasStations: GasStationLocation[] = [];
  public waterMesh?: THREE.Mesh;
  private rapier: typeof RAPIER;
  private world: RAPIER.World;

  constructor(rapier: typeof RAPIER, world: RAPIER.World) {
    this.rapier = rapier;
    this.world = world;
    this.mesh = new THREE.Group();

    this.buildTerrain();
    this.buildMountainCreek();
    this.buildPineForest();
    this.buildRockOutcrops();
    this.buildGasStations();
    this.buildForestObstacles();
  }

  /**
   * Authoritative mathematical height function for the entire forest valley
   */
  public getTerrainHeight(x: number, z: number): number {
    const edgeDist = Math.max(Math.abs(x), Math.abs(z));

    // 1. Boundary Mountain Enclosure (High steep ridges containing the map)
    if (edgeDist > 185) {
      const wallFactor = (edgeDist - 185) / 65.0;
      return Math.pow(wallFactor, 1.85) * 48.0 + Math.sin(x * 0.08) * Math.cos(z * 0.08) * 5.0;
    }

    // 2. Flat Apron for Main Gas Station & Trailhead Spawn
    const distToStation1 = Math.hypot(x - 22, z - 8);
    if (distToStation1 < 24) {
      return 0.0;
    }
    if (distToStation1 < 36) {
      const blend = (distToStation1 - 24) / 12.0;
      const naturalY = Math.sin(x * 0.025) * Math.cos(z * 0.025) * 2.2;
      return naturalY * blend;
    }

    // 3. Flat Apron for Outpost Gas Station
    const distToStation2 = Math.hypot(x - (-85), z - (-60));
    if (distToStation2 < 20) {
      return 1.8;
    }
    if (distToStation2 < 32) {
      const blend = (distToStation2 - 20) / 12.0;
      const naturalY = Math.sin(z * 0.035) * 4.5 + Math.cos(x * 0.045) * 3.5;
      return 1.8 * (1.0 - blend) + naturalY * blend;
    }

    // 4. Stream Ravine & Creek Depression (West side)
    if (x < -30 && Math.abs(z) < 32) {
      const creekCenterDist = Math.abs(x - (-52));
      const creekDepth = Math.max(0, 1.0 - creekCenterDist / 22.0) * 4.2;
      const baseTerrain = Math.sin(z * 0.03) * 3.8 + Math.sin(x * 0.04) * 2.5;
      return baseTerrain - creekDepth;
    }

    // 5. Eastern Rolling Pine Slopes & Mud Mounds
    if (x > 35) {
      return (
        Math.sin(x * 0.032 + z * 0.028) * 6.5 +
        Math.cos(x * 0.018 - z * 0.022) * 4.2 +
        Math.sin(z * 0.065) * 1.6
      );
    }

    // 6. Northern High Logging Trail
    if (z < -35) {
      return Math.sin(z * 0.035) * 4.2 + Math.cos(x * 0.042) * 3.8;
    }

    // 7. Southern Valley Basin & Trail Mud Humps
    return (
      Math.sin(x * 0.028) * Math.cos(z * 0.028) * 2.6 +
      Math.sin(x * 0.09) * 0.45 * Math.cos(z * 0.09)
    );
  }

  private buildTerrain() {
    const size = 520;
    const segs = 180;

    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Natural Earth & Nordic Pine Forest Color Palette
    const soilColor = new THREE.Color(0x2d2016); // Dark pine needle mulch / organic damp earth
    const mossColor = new THREE.Color(0x1e2e1a); // Rich forest moss
    const roadColor = new THREE.Color(0x3e3428); // Packed dirt / gravel trail
    const mudColor = new THREE.Color(0x281f18); // Wet muddy tire track
    const mountainRock = new THREE.Color(0x423d37); // Granite ridge rock
    const asphaltColor = new THREE.Color(0x242629); // Concrete service pad

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const y = this.getTerrainHeight(x, z);
      pos.setY(i, y);

      // Color mapping
      const col = new THREE.Color();
      const distToCenter = Math.hypot(x, z);
      const distToStation1 = Math.hypot(x - 22, z - 8);
      const distToStation2 = Math.hypot(x - (-85), z - (-60));

      if (distToStation1 < 18 || distToStation2 < 16) {
        col.copy(asphaltColor);
      } else if (y > 18) {
        // High steep mountain crags
        col.copy(mountainRock);
      } else if (distToCenter < 34 || (Math.abs(x) < 8.5 && z > -25) || (Math.abs(z) < 8.0 && x > 5)) {
        // Main valley dirt trail
        col.copy(roadColor).lerp(mudColor, Math.sin(x * 0.2) * 0.5 + 0.5);
      } else if (x < -32 && Math.abs(z) < 28) {
        // Creek bed
        col.copy(mudColor).lerp(soilColor, 0.4);
      } else {
        // Organic forest floor
        const blend = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 0.5 + 0.5;
        col.copy(soilColor).lerp(mossColor, blend * 0.8);
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // High-Resolution Procedural Forest Floor PBR Textures
    const { diffuse, normal, roughness } = this.createForestFloorTextures();

    const mat = new THREE.MeshStandardMaterial({
      map: diffuse,
      normalMap: normal,
      roughnessMap: roughness,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.06,
      flatShading: false
    });

    const terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    this.mesh.add(terrainMesh);

    // Build Rapier Trimesh Collider
    const vertices = new Float32Array(pos.array);
    const indices = new Uint32Array(geo.index!.array);

    const bodyDesc = this.rapier.RigidBodyDesc.fixed();
    const terrainBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.trimesh(vertices, indices).setFriction(0.85);

    this.world.createCollider(colliderDesc, terrainBody);
  }

  /**
   * Generates high-definition diffuse, normal, and wetness/roughness maps
   */
  private createForestFloorTextures(): {
    diffuse: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
    roughness: THREE.CanvasTexture;
  } {
    const size = 1024;
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const diffCtx = diffCanvas.getContext('2d')!;

    const normCanvas = document.createElement('canvas');
    normCanvas.width = size;
    normCanvas.height = size;
    const normCtx = normCanvas.getContext('2d')!;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const roughCtx = roughCanvas.getContext('2d')!;

    const diffImg = diffCtx.createImageData(size, size);
    const normImg = normCtx.createImageData(size, size);
    const roughImg = roughCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Multi-scale organic earth, pebbles, and pine needles
        const n1 = Math.sin(x * 0.04) * Math.cos(y * 0.04);
        const n2 = Math.sin(x * 0.12 + y * 0.1) * 0.5;
        const n3 = Math.sin(x * 0.35 - y * 0.3) * 0.25;
        const speck = (Math.random() - 0.5) * 0.15;
        const val = n1 * 0.35 + n2 * 0.25 + n3 * 0.15 + speck + 0.5;

        // Base soil color
        diffImg.data[idx] = Math.floor(58 + val * 35);
        diffImg.data[idx + 1] = Math.floor(48 + val * 30);
        diffImg.data[idx + 2] = Math.floor(36 + val * 24);
        diffImg.data[idx + 3] = 255;

        // Bump Normal Map
        normImg.data[idx] = Math.floor((Math.sin(x * 0.15) * 0.25 + 0.5) * 255);
        normImg.data[idx + 1] = Math.floor((Math.cos(y * 0.15) * 0.25 + 0.5) * 255);
        normImg.data[idx + 2] = 245;
        normImg.data[idx + 3] = 255;

        // Roughness Map (Puddles & mud tracks glisten with low roughness)
        const isWet = (val < 0.38) ? 0.2 : 0.88;
        const rVal = Math.floor(isWet * 255);
        roughImg.data[idx] = rVal;
        roughImg.data[idx + 1] = rVal;
        roughImg.data[idx + 2] = rVal;
        roughImg.data[idx + 3] = 255;
      }
    }

    diffCtx.putImageData(diffImg, 0, 0);
    normCtx.putImageData(normImg, 0, 0);
    roughCtx.putImageData(roughImg, 0, 0);

    const repeat = 32;

    const diffuse = new THREE.CanvasTexture(diffCanvas);
    diffuse.wrapS = THREE.RepeatWrapping;
    diffuse.wrapT = THREE.RepeatWrapping;
    diffuse.repeat.set(repeat, repeat);

    const normal = new THREE.CanvasTexture(normCanvas);
    normal.wrapS = THREE.RepeatWrapping;
    normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(repeat, repeat);

    const roughness = new THREE.CanvasTexture(roughCanvas);
    roughness.wrapS = THREE.RepeatWrapping;
    roughness.wrapT = THREE.RepeatWrapping;
    roughness.repeat.set(repeat, repeat);

    return { diffuse, normal, roughness };
  }

  /**
   * Mountain stream water plane in the western creek ravine
   */
  private buildMountainCreek() {
    const waterGeo = new THREE.PlaneGeometry(45, 90, 16, 16);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x22484a,
      roughness: 0.1,
      metalness: 0.15,
      transmission: 0.65,
      opacity: 0.85,
      transparent: true,
      ior: 1.333
    });

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(-52, -2.6, 0);
    this.waterMesh.receiveShadow = true;
    this.mesh.add(this.waterMesh);
  }

  /**
   * High-Quality 3D Evergreen Spruce Forest (Multi-tier drooping pine branches)
   */
  private buildPineForest() {
    const treeCount = 280;

    const tiers = [
      { radius: 4.4, height: 3.6, y: 3.5 },
      { radius: 3.6, height: 3.2, y: 5.8 },
      { radius: 2.8, height: 2.8, y: 7.8 },
      { radius: 2.0, height: 2.4, y: 9.6 },
      { radius: 1.1, height: 2.0, y: 11.2 }
    ];

    const branchGeos: THREE.BufferGeometry[] = [];
    tiers.forEach((t) => {
      const cone = new THREE.ConeGeometry(t.radius, t.height, 8);
      cone.translate(0, t.y, 0);
      branchGeos.push(cone);
    });

    let totalVerts = 0;
    branchGeos.forEach((g) => {
      totalVerts += g.attributes.position.count;
    });
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);

    let offset = 0;
    branchGeos.forEach((g) => {
      positions.set(g.attributes.position.array, offset * 3);
      normals.set(g.attributes.normal.array, offset * 3);
      offset += g.attributes.position.count;
    });

    const mergedFoliageGeo = new THREE.BufferGeometry();
    mergedFoliageGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mergedFoliageGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x142b17, // Natural dark alpine pine green
      roughness: 0.75,
      metalness: 0.05
    });

    const foliageMesh = new THREE.InstancedMesh(mergedFoliageGeo, foliageMat, treeCount);
    foliageMesh.castShadow = true;
    foliageMesh.receiveShadow = true;

    // Solid Wood Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.38, 0.72, 8.5, 8);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x22160d, // Dark wood bark
      roughness: 0.95
    });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;

    while (placed < treeCount && attempts < 1500) {
      attempts++;
      const x = (Math.random() - 0.5) * 360;
      const z = (Math.random() - 0.5) * 360;

      // Keep road & gas stations clear
      const distToStation1 = Math.hypot(x - 22, z - 8);
      const distToStation2 = Math.hypot(x - (-85), z - (-60));
      if (distToStation1 < 22 || distToStation2 < 20) continue;
      if (Math.abs(x) < 12 && Math.abs(z) < 65) continue; // Main trail corridor
      if (x < -36 && x > -68 && Math.abs(z) < 26) continue; // Creek corridor

      const groundY = this.getTerrainHeight(x, z);
      if (groundY > 26) continue; // Don't place on sheer cliffs

      const scale = 0.8 + Math.random() * 0.55;

      // Trunk (Buried 2m into terrain so base is firmly anchored)
      dummy.position.set(x, groundY + 2.0 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(placed, dummy.matrix);

      // Foliage Canopy
      dummy.position.set(x, groundY, z);
      dummy.updateMatrix();
      foliageMesh.setMatrixAt(placed, dummy.matrix);

      // Physics Trunk Collider
      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
        x,
        groundY + 2.5 * scale,
        z
      );
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cylinder(3.0 * scale, 0.45 * scale);
      this.world.createCollider(col, body);

      placed++;
    }

    foliageMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(trunkMesh, foliageMesh);
  }

  /**
   * Granite Boulders & Rock Outcrops for realistic rock crawling
   */
  private buildRockOutcrops() {
    const rockCount = 55;
    const rockGeo = new THREE.DodecahedronGeometry(1.6, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x48423b,
      roughness: 0.9,
      metalness: 0.1
    });

    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;

    while (placed < rockCount && attempts < 800) {
      attempts++;
      const x = (Math.random() - 0.5) * 320;
      const z = (Math.random() - 0.5) * 320;

      // Avoid flat staging areas
      const distToStation1 = Math.hypot(x - 22, z - 8);
      const distToStation2 = Math.hypot(x - (-85), z - (-60));
      if (distToStation1 < 18 || distToStation2 < 16) continue;

      const groundY = this.getTerrainHeight(x, z);
      const scaleX = 0.8 + Math.random() * 1.5;
      const scaleY = 0.6 + Math.random() * 1.0;
      const scaleZ = 0.8 + Math.random() * 1.5;

      dummy.position.set(x, groundY + 0.5 * scaleY, z);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.rotation.set(
        Math.random() * 0.4,
        Math.random() * Math.PI * 2,
        Math.random() * 0.4
      );
      dummy.updateMatrix();
      rockMesh.setMatrixAt(placed, dummy.matrix);

      // Rapier Collider for Boulder
      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
        x,
        groundY + 0.5 * scaleY,
        z
      );
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cuboid(
        scaleX * 1.1,
        scaleY * 0.7,
        scaleZ * 1.1
      ).setFriction(0.9);
      this.world.createCollider(col, body);

      placed++;
    }

    rockMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(rockMesh);
  }

  /**
   * 3D Petrol Pump Stations with dynamic refueling zones
   */
  private buildGasStations() {
    this.createPetrolStation(new THREE.Vector3(22, 0, 8), 'VALLEY FUEL • DIESEL');
    this.gasStations.push({ pos: new THREE.Vector3(22, 0, 8), radius: 8.5 });

    const outpostY = this.getTerrainHeight(-85, -60);
    this.createPetrolStation(new THREE.Vector3(-85, outpostY, -60), 'OUTPOST 2 • DIESEL');
    this.gasStations.push({ pos: new THREE.Vector3(-85, outpostY, -60), radius: 8.5 });
  }

  private createPetrolStation(pos: THREE.Vector3, stationName: string) {
    const station = new THREE.Group();

    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.35,
      metalness: 0.6
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.25,
      metalness: 0.85
    });

    const pumpMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.35,
      metalness: 0.5
    });

    const signMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 1.5
    });

    // 1. Concrete Pump Island
    const islandGeo = new THREE.BoxGeometry(3.5, 0.4, 12.0);
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.y = 0.2;
    island.receiveShadow = true;
    station.add(island);

    // 2. Dual Digital Petrol Pumps
    for (const pz of [-3.2, 3.2]) {
      const pumpGroup = new THREE.Group();

      const bodyGeo = new THREE.BoxGeometry(1.2, 2.2, 0.9);
      const pumpBody = new THREE.Mesh(bodyGeo, pumpMat);
      pumpBody.position.y = 1.1;
      pumpBody.castShadow = true;

      const screenGeo = new THREE.BoxGeometry(0.8, 0.45, 0.92);
      const screenMat = new THREE.MeshStandardMaterial({
        color: 0x059669,
        emissive: 0x10b981,
        emissiveIntensity: 2.0
      });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.y = 1.4;

      const hoseGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
      const hoseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      const hoseL = new THREE.Mesh(hoseGeo, hoseMat);
      hoseL.position.set(-0.62, 1.0, 0);
      const hoseR = hoseL.clone();
      hoseR.position.x = 0.62;

      pumpGroup.add(pumpBody, screen, hoseL, hoseR);
      pumpGroup.position.z = pz;
      station.add(pumpGroup);

      const pBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
        pos.x,
        pos.y + 1.1,
        pos.z + pz
      );
      const pBody = this.world.createRigidBody(pBodyDesc);
      const col = this.rapier.ColliderDesc.cuboid(0.6, 1.1, 0.45);
      this.world.createCollider(col, pBody);
    }

    // 3. Overhead Canopy
    const roofGeo = new THREE.BoxGeometry(10.0, 0.6, 16.0);
    const roof = new THREE.Mesh(roofGeo, canopyMat);
    roof.position.y = 6.2;
    roof.castShadow = true;

    const signGeo = new THREE.BoxGeometry(10.2, 0.8, 1.2);
    const signFront = new THREE.Mesh(signGeo, signMat);
    signFront.position.set(0, 6.2, 7.8);
    station.add(roof, signFront);

    // Canopy Columns
    const colGeo = new THREE.CylinderGeometry(0.25, 0.25, 6.0, 12);
    for (const cx of [-3.8, 3.8]) {
      for (const cz of [-6.0, 6.0]) {
        const pillar = new THREE.Mesh(colGeo, steelMat);
        pillar.position.set(cx, 3.0, cz);
        pillar.castShadow = true;
        station.add(pillar);

        const colBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
          pos.x + cx,
          pos.y + 3.0,
          pos.z + cz
        );
        const colBody = this.world.createRigidBody(colBodyDesc);
        const cCol = this.rapier.ColliderDesc.cylinder(3.0, 0.25);
        this.world.createCollider(cCol, colBody);
      }
    }

    // Under-canopy floodlight
    const bayLight = new THREE.PointLight(0xfffaed, 3.5, 24, 1.2);
    bayLight.position.set(0, 5.6, 0);
    bayLight.castShadow = true;
    station.add(bayLight);

    // Glowing green refueling ring on ground
    const triggerRingGeo = new THREE.RingGeometry(2.5, 3.2, 28);
    triggerRingGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const triggerRing = new THREE.Mesh(triggerRingGeo, ringMat);
    triggerRing.position.y = 0.22;
    station.add(triggerRing);

    station.position.copy(pos);
    this.mesh.add(station);
  }

  private buildForestObstacles() {
    // Heavy Log Bridge spanning Creek Ravine
    const bridgeY = this.getTerrainHeight(-42, 0);
    this.createLogBridge(new THREE.Vector3(-42, bridgeY, 0), 18, 5.5);

    // Fallen Trunk Obstacles on Trails
    const log1Y = this.getTerrainHeight(0, 45);
    this.createFallenLog(new THREE.Vector3(0, log1Y + 0.4, 45), 12, 0.65, 0.2);

    const log2Y = this.getTerrainHeight(65, -30);
    this.createFallenLog(new THREE.Vector3(65, log2Y + 0.4, -30), 10, 0.75, -0.4);
  }

  private createLogBridge(pos: THREE.Vector3, length: number, width: number) {
    const bridge = new THREE.Group();
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 });

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

    const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    const body = this.world.createRigidBody(bodyDesc);
    const col = this.rapier.ColliderDesc.cuboid(width * 0.5, 0.25, length * 0.5).setFriction(0.9);
    this.world.createCollider(col, body);
  }

  private createFallenLog(pos: THREE.Vector3, length: number, radius: number, rotY: number) {
    const logGeo = new THREE.CylinderGeometry(radius, radius, length, 10);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x332216, roughness: 0.95 });
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rotY;
    log.position.copy(pos);
    log.castShadow = true;
    log.receiveShadow = true;
    this.mesh.add(log);

    const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    const body = this.world.createRigidBody(bodyDesc);
    const col = this.rapier.ColliderDesc.cylinder(length * 0.5, radius);
    this.world.createCollider(col, body);
  }
}

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
    this.buildLushPineForest();
    this.buildGraniteBoulders();
    this.buildGasStations();
    this.buildForestObstacles();
  }

  /**
   * Authoritative height function for forest terrain
   */
  public getTerrainHeight(x: number, z: number): number {
    const edgeDist = Math.max(Math.abs(x), Math.abs(z));

    // 1. Surrounding Mountain Ridges enclosing the forest valley
    if (edgeDist > 185) {
      const wallFactor = (edgeDist - 185) / 60.0;
      return Math.pow(wallFactor, 1.8) * 45.0 + Math.sin(x * 0.08) * Math.cos(z * 0.08) * 4.0;
    }

    // 2. Flat Pad for Main Trailhead Gas Station
    const distStation1 = Math.hypot(x - 22, z - 8);
    if (distStation1 < 22) return 0.0;
    if (distStation1 < 34) {
      const t = (distStation1 - 22) / 12.0;
      const natural = Math.sin(x * 0.025) * Math.cos(z * 0.025) * 2.2;
      return natural * t;
    }

    // 3. Flat Pad for Mountain Outpost Gas Station
    const distStation2 = Math.hypot(x - (-85), z - (-60));
    if (distStation2 < 20) return 1.8;
    if (distStation2 < 32) {
      const t = (distStation2 - 20) / 12.0;
      const natural = Math.sin(z * 0.035) * 4.2 + Math.cos(x * 0.042) * 3.5;
      return 1.8 * (1.0 - t) + natural * t;
    }

    // 4. Creek Ravine (West)
    if (x < -32 && Math.abs(z) < 32) {
      const creekDist = Math.abs(x - (-52));
      const creekDepth = Math.max(0, 1.0 - creekDist / 20.0) * 4.5;
      const base = Math.sin(z * 0.03) * 3.5 + Math.sin(x * 0.04) * 2.2;
      return base - creekDepth;
    }

    // 5. Eastern Rolling Slopes
    if (x > 35) {
      return (
        Math.sin(x * 0.03 + z * 0.025) * 6.2 +
        Math.cos(x * 0.016 - z * 0.02) * 4.0 +
        Math.sin(z * 0.06) * 1.5
      );
    }

    // 6. North High Logging Pass
    if (z < -35) {
      return Math.sin(z * 0.032) * 4.0 + Math.cos(x * 0.04) * 3.5;
    }

    // 7. Valley Floor & Rolling Dirt Trails
    return (
      Math.sin(x * 0.026) * Math.cos(z * 0.026) * 2.4 +
      Math.sin(x * 0.08) * 0.35 * Math.cos(z * 0.08)
    );
  }

  private buildTerrain() {
    const size = 520;
    const segs = 160;

    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Natural Nordic Forest Earth Palette (Rich, matte, realistic)
    const deepSoilColor = new THREE.Color(0x32251a); // Rich dark forest earth
    const pineMulchColor = new THREE.Color(0x281c13); // Damp pine needle mulch
    const forestMossColor = new THREE.Color(0x23331b); // Natural alpine moss
    const dirtRoadColor = new THREE.Color(0x3d3224); // Packed gravel dirt trail
    const mountainRockColor = new THREE.Color(0x423e38); // Granite rock cliffs
    const servicePadColor = new THREE.Color(0x26292d); // Weathered asphalt pad

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const y = this.getTerrainHeight(x, z);
      pos.setY(i, y);

      const col = new THREE.Color();
      const distCenter = Math.hypot(x, z);
      const distS1 = Math.hypot(x - 22, z - 8);
      const distS2 = Math.hypot(x - (-85), z - (-60));

      if (distS1 < 18 || distS2 < 16) {
        col.copy(servicePadColor);
      } else if (y > 18) {
        // High steep mountain crags
        const rockMix = Math.min(1.0, (y - 18) / 16.0);
        col.copy(mountainRockColor).lerp(new THREE.Color(0x35322c), rockMix * 0.4);
      } else if (distCenter < 32 || (Math.abs(x) < 8.0 && z > -25) || (Math.abs(z) < 7.5 && x > 4)) {
        // Main packed dirt trail
        col.copy(dirtRoadColor);
      } else if (x < -34 && Math.abs(z) < 28) {
        // Creek bed
        col.copy(pineMulchColor).lerp(deepSoilColor, 0.5);
      } else {
        // Natural organic forest loam with soft moss patches
        const mossNoise = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.5 + 0.5;
        col.copy(deepSoilColor).lerp(forestMossColor, mossNoise * 0.75);
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Natural Organic Ground Texture (NO repeating sine wave diamond patterns!)
    const diffuseMap = this.createMatteForestFloorTexture();

    const mat = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      vertexColors: true,
      roughness: 0.94, // Completely matte natural earth (no shiny plastic diamonds!)
      metalness: 0.02,
      flatShading: false
    });

    const terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    this.mesh.add(terrainMesh);

    // Physics trimesh
    const vertices = new Float32Array(pos.array);
    const indices = new Uint32Array(geo.index!.array);
    const bodyDesc = this.rapier.RigidBodyDesc.fixed();
    const terrainBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.trimesh(vertices, indices).setFriction(0.85);
    this.world.createCollider(colliderDesc, terrainBody);
  }

  /**
   * Generates a completely seamless, soft organic forest floor texture (NO periodic sine waves!)
   */
  private createMatteForestFloorTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);

    // Multi-octave pseudo-random organic noise
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = Math.floor(Math.random() * 256);

    const noise2D = (x: number, y: number): number => {
      const xi = Math.floor(x) & 255;
      const yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);
      const a = perm[xi] + yi;
      const b = perm[xi + 1] + yi;
      const g1 = (perm[a & 255] / 255.0);
      const g2 = (perm[b & 255] / 255.0);
      const g3 = (perm[(a + 1) & 255] / 255.0);
      const g4 = (perm[(b + 1) & 255] / 255.0);
      const x1 = g1 * (1 - u) + g2 * u;
      const x2 = g3 * (1 - u) + g4 * u;
      return x1 * (1 - v) + x2 * v;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Smooth fractal noise
        const n1 = noise2D(x * 0.04, y * 0.04);
        const n2 = noise2D(x * 0.12, y * 0.12) * 0.5;
        const n3 = noise2D(x * 0.3, y * 0.3) * 0.25;
        const total = (n1 + n2 + n3) / 1.75;

        // Rich, soft earth tones (RGB 110-150 range so it blends seamlessly with vertex colors)
        const tone = Math.floor(105 + total * 45);
        img.data[idx] = tone;
        img.data[idx + 1] = Math.floor(tone * 0.92);
        img.data[idx + 2] = Math.floor(tone * 0.82);
        img.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    return texture;
  }

  /**
   * Western Creek with soft reflective water
   */
  private buildMountainCreek() {
    const waterGeo = new THREE.PlaneGeometry(42, 85, 8, 8);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x1f3c3e,
      roughness: 0.15,
      metalness: 0.1,
      transmission: 0.7,
      opacity: 0.85,
      transparent: true,
      ior: 1.333
    });

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(-52, -2.5, 0);
    this.waterMesh.receiveShadow = true;
    this.mesh.add(this.waterMesh);
  }

  /**
   * Realistic, Lush Nordic Pine Trees (Trunk and 7 dense overlapping foliage tiers)
   */
  private buildLushPineForest() {
    const treeCount = 240;

    // Build one unified realistic Pine Tree Geometry:
    // 1. Trunk (Cylinder centered with base at y = 0)
    const trunkHeight = 11.0;
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.65, trunkHeight, 8);
    trunkGeo.translate(0, trunkHeight * 0.5, 0); // Base at y = 0!

    // 2. Cascading Dense Overlapping Foliage Tiers covering trunk completely
    const tiers = [
      { radius: 4.6, height: 3.4, y: 3.0 },
      { radius: 4.0, height: 3.0, y: 4.8 },
      { radius: 3.4, height: 2.8, y: 6.4 },
      { radius: 2.7, height: 2.6, y: 7.9 },
      { radius: 2.0, height: 2.4, y: 9.3 },
      { radius: 1.3, height: 2.2, y: 10.6 },
      { radius: 0.6, height: 1.8, y: 11.8 }
    ];

    const branchGeos: THREE.BufferGeometry[] = [];
    tiers.forEach((t) => {
      const cone = new THREE.ConeGeometry(t.radius, t.height, 8);
      cone.translate(0, t.y, 0);
      branchGeos.push(cone);
    });

    let totalVerts = 0;
    branchGeos.forEach((g) => { totalVerts += g.attributes.position.count; });
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
      color: 0x162c18, // Rich dark spruce green
      roughness: 0.8,
      metalness: 0.05
    });

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x24180f, // Dark wood bark
      roughness: 0.95
    });

    const foliageMesh = new THREE.InstancedMesh(mergedFoliageGeo, foliageMat, treeCount);
    foliageMesh.castShadow = true;
    foliageMesh.receiveShadow = true;

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;

    while (placed < treeCount && attempts < 1800) {
      attempts++;
      const x = (Math.random() - 0.5) * 350;
      const z = (Math.random() - 0.5) * 350;

      // Keep clear of roads and stations
      const distS1 = Math.hypot(x - 22, z - 8);
      const distS2 = Math.hypot(x - (-85), z - (-60));
      if (distS1 < 24 || distS2 < 22) continue;
      if (Math.abs(x) < 12 && Math.abs(z) < 65) continue;
      if (x < -36 && x > -68 && Math.abs(z) < 26) continue;

      const groundY = this.getTerrainHeight(x, z);
      if (groundY > 24) continue;

      const scale = 0.8 + Math.random() * 0.55;

      // Both Trunk & Foliage share EXACT SAME position, scale, and rotation!
      dummy.position.set(x, groundY - 0.5 * scale, z); // Anchor 0.5m into ground
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(placed, dummy.matrix);
      foliageMesh.setMatrixAt(placed, dummy.matrix);

      // Physics tree collider
      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
        x,
        groundY + 3.0 * scale,
        z
      );
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cylinder(3.5 * scale, 0.45 * scale);
      this.world.createCollider(col, body);

      placed++;
    }

    foliageMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(trunkMesh, foliageMesh);
  }

  /**
   * Granite Boulders & Rock Outcrops
   */
  private buildGraniteBoulders() {
    const rockCount = 50;
    const rockGeo = new THREE.DodecahedronGeometry(1.6, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x423c35,
      roughness: 0.9,
      metalness: 0.08
    });

    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;

    while (placed < rockCount && attempts < 900) {
      attempts++;
      const x = (Math.random() - 0.5) * 310;
      const z = (Math.random() - 0.5) * 310;

      const distS1 = Math.hypot(x - 22, z - 8);
      const distS2 = Math.hypot(x - (-85), z - (-60));
      if (distS1 < 20 || distS2 < 18) continue;

      const groundY = this.getTerrainHeight(x, z);
      const scaleX = 0.8 + Math.random() * 1.4;
      const scaleY = 0.5 + Math.random() * 0.9;
      const scaleZ = 0.8 + Math.random() * 1.4;

      dummy.position.set(x, groundY + 0.3 * scaleY, z);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.rotation.set(
        Math.random() * 0.4,
        Math.random() * Math.PI * 2,
        Math.random() * 0.4
      );
      dummy.updateMatrix();
      rockMesh.setMatrixAt(placed, dummy.matrix);

      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
        x,
        groundY + 0.3 * scaleY,
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
   * High-Quality Industrial Petrol Station
   */
  private buildGasStations() {
    this.createPetrolStation(new THREE.Vector3(22, 0, 8), 'VALLEY RALLY SERVICE');
    this.gasStations.push({ pos: new THREE.Vector3(22, 0, 8), radius: 8.5 });

    const outpostY = this.getTerrainHeight(-85, -60);
    this.createPetrolStation(new THREE.Vector3(-85, outpostY, -60), 'OUTPOST REFUEL');
    this.gasStations.push({ pos: new THREE.Vector3(-85, outpostY, -60), radius: 8.5 });
  }

  private createPetrolStation(pos: THREE.Vector3, stationName: string) {
    const station = new THREE.Group();

    // Industrial Materials
    const darkRoofMat = new THREE.MeshStandardMaterial({
      color: 0x181c22,
      roughness: 0.4,
      metalness: 0.7
    });

    const steelColumnMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.3,
      metalness: 0.85
    });

    const pumpHousingMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Industrial amber pump
      roughness: 0.35,
      metalness: 0.5
    });

    const neonSignMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 1.8
    });

    // 1. Concrete Island with Yellow Curb
    const islandGeo = new THREE.BoxGeometry(3.6, 0.4, 12.0);
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.y = 0.2;
    island.receiveShadow = true;

    // Yellow Hazard Edge Curb Lines
    const curbGeo = new THREE.BoxGeometry(3.8, 0.15, 12.2);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.position.y = 0.08;
    station.add(curb, island);

    // 2. Realistic Dual Fuel Dispensers
    for (const pz of [-3.2, 3.2]) {
      const pumpGroup = new THREE.Group();

      const bodyGeo = new THREE.BoxGeometry(1.2, 2.2, 0.9);
      const pumpBody = new THREE.Mesh(bodyGeo, pumpHousingMat);
      pumpBody.position.y = 1.1;
      pumpBody.castShadow = true;

      // Digital Lit LED Screen
      const screenGeo = new THREE.BoxGeometry(0.8, 0.45, 0.92);
      const screenMat = new THREE.MeshStandardMaterial({
        color: 0x064e3b,
        emissive: 0x10b981,
        emissiveIntensity: 2.2
      });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.y = 1.4;

      // Hose & Nozzles
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

    // 3. Overhead Steel Canopy Roof
    const roofGeo = new THREE.BoxGeometry(10.2, 0.7, 16.2);
    const roof = new THREE.Mesh(roofGeo, darkRoofMat);
    roof.position.y = 6.0;
    roof.castShadow = true;

    // Illuminated Fascia Trim
    const signGeo = new THREE.BoxGeometry(10.4, 0.6, 1.0);
    const signFront = new THREE.Mesh(signGeo, neonSignMat);
    signFront.position.set(0, 6.0, 8.0);
    station.add(roof, signFront);

    // Heavy Steel I-Beams / Columns
    const colGeo = new THREE.CylinderGeometry(0.28, 0.28, 5.8, 12);
    for (const cx of [-3.8, 3.8]) {
      for (const cz of [-6.0, 6.0]) {
        const pillar = new THREE.Mesh(colGeo, steelColumnMat);
        pillar.position.set(cx, 2.9, cz);
        pillar.castShadow = true;
        station.add(pillar);

        const colBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
          pos.x + cx,
          pos.y + 2.9,
          pos.z + cz
        );
        const colBody = this.world.createRigidBody(colBodyDesc);
        const cCol = this.rapier.ColliderDesc.cylinder(2.9, 0.28);
        this.world.createCollider(cCol, colBody);
      }
    }

    // Warm Under-Canopy Lighting
    const bayLight = new THREE.PointLight(0xfffaea, 3.5, 24, 1.2);
    bayLight.position.set(0, 5.5, 0);
    bayLight.castShadow = true;
    station.add(bayLight);

    // Glowing Green Refueling Area Pad Ring
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

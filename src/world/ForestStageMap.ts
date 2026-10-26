import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GasStationLocation {
  pos: THREE.Vector3;
  radius: number;
}

export interface SurfaceInfo {
  type: 'trail' | 'mud' | 'water' | 'grass' | 'rock';
  friction: number;
  rollingResistance: number;
  depth: number;
  bumpiness: number;
}

export class ForestStageMap {
  public mesh: THREE.Group;
  public gasStations: GasStationLocation[] = [];
  public waterMesh?: THREE.Mesh;
  public grassMesh?: THREE.InstancedMesh;
  private rapier: typeof RAPIER;
  private world: RAPIER.World;

  // Map Radius & Extents
  public readonly mapSize: number = 520;       // 520m x 520m total grid size
  public readonly mapRadius: number = 260;     // 260m maximum radius from center (0,0)
  public readonly playableRadius: number = 185;// 185m active valley floor before mountain ridges rise

  constructor(rapier: typeof RAPIER, world: RAPIER.World) {
    this.rapier = rapier;
    this.world = world;
    this.mesh = new THREE.Group();

    this.buildTerrain();
    this.buildGhibliMountainCreek();
    this.buildLushPineForest();
    this.buildGhibliPainterlyGrass();
    this.buildGraniteBoulders();
    this.buildGasStations();
    this.buildRallyObstaclesAndBridges();

    // New Physical Obstacle Systems
    this.buildRiverWaterRocks();
    this.buildFallenLogObstacles();
    this.buildBarrierBlocksAndChicanes();
    this.buildDeepForestZoneAndStumps();
    this.buildRockCrawlSection();
  }

  /**
   * Distance to off-road rally circuit trail center
   */
  public getTrailDistance(x: number, z: number): number {
    let minD = 999.0;

    // 1. Trailhead start straight and North Valley trail (z: 30 to -85, x near 0)
    if (z > -85 && z < 45) {
      const trailX = Math.sin(z * 0.045) * 8.5;
      minD = Math.min(minD, Math.hypot(x - trailX, 0));
    }

    // 2. High Logging Pass (curves West from (8, -85) to (-85, -60))
    if (z < -45 && x < 25 && x > -95) {
      const t = (x - (-85)) / 110.0;
      const passZ = -60 - Math.sin(t * Math.PI) * 28.0;
      minD = Math.min(minD, Math.hypot(z - passZ, 0));
    }

    // 3. Ravine descent & Mud crossing into River (from (-85, -55) to (-52, 10))
    if (x < -35 && x > -95 && z > -60 && z < 25) {
      const t = (z - (-60)) / 85.0;
      const descentX = -85 + t * 33.0;
      minD = Math.min(minD, Math.hypot(x - descentX, 0));
    }

    // 4. South Meadow return loop (from (-52, 10) through (-20, 45) to (0, 15))
    if (z > 5 && z < 65) {
      const loopZ = 42 + Math.sin(x * 0.06) * 12.0;
      minD = Math.min(minD, Math.hypot(z - loopZ, 0));
    }

    // 5. Eastern Ridge switchback climb (from (10, -15) to (75, -25) to (40, 25))
    if (x > 8 && x < 85 && z > -35 && z < 35) {
      const ridgeZ = -15 + Math.sin(x * 0.05) * 22.0;
      minD = Math.min(minD, Math.hypot(z - ridgeZ, 0));
    }

    return minD;
  }

  /**
   * Real off-road surface query for realistic vehicle tire physics
   */
  public getSurfaceAt(x: number, z: number): SurfaceInfo {
    // 1. Creek Ravine & Deep River Ford
    if (x < -36 && x > -68 && Math.abs(z) < 28) {
      const riverDist = Math.hypot(x - (-52), z);
      if (riverDist < 16.0) {
        // Deep Mountain River Ford
        return {
          type: 'water',
          friction: 0.50,
          rollingResistance: 0.60,
          depth: 0.44,
          bumpiness: 0.08
        };
      } else {
        // Deep Mud Pit / Mud Bog
        return {
          type: 'mud',
          friction: 0.54,
          rollingResistance: 0.45,
          depth: 0.28,
          bumpiness: 0.14
        };
      }
    }

    // 2. High Mountain Ridges & Rock Crawl Section
    const y = this.getTerrainHeight(x, z);
    if (y > 18.0 || (x > 50 && x < 78 && z > -25 && z < 10)) {
      return {
        type: 'rock',
        friction: 0.92,
        rollingResistance: 0.09,
        depth: 0.0,
        bumpiness: 0.16
      };
    }

    // 3. Packed Off-Road Dirt Trail
    const distTrail = this.getTrailDistance(x, z);
    if (distTrail < 5.2) {
      return {
        type: 'trail',
        friction: 0.98,
        rollingResistance: 0.05,
        depth: 0.02,
        bumpiness: 0.04
      };
    }

    // 4. Lush Alpine Meadow Grass
    return {
      type: 'grass',
      friction: 0.82,
      rollingResistance: 0.12,
      depth: 0.06,
      bumpiness: 0.06
    };
  }

  /**
   * Authoritative height function for forest terrain
   */
  public getTerrainHeight(x: number, z: number): number {
    const edgeDist = Math.max(Math.abs(x), Math.abs(z));

    // 1. Surrounding Mountain Ridges enclosing the forest valley (radius > 185m)
    if (edgeDist > this.playableRadius) {
      const wallFactor = (edgeDist - this.playableRadius) / 60.0;
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
      const creekDepth = Math.max(0, 1.0 - creekDist / 20.0) * 4.2;
      const base = Math.sin(z * 0.03) * 3.2 + Math.sin(x * 0.04) * 2.0;
      return base - creekDepth;
    }

    // 5. Eastern Rolling Slopes & Ridge
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
    const size = this.mapSize;
    const segs = 170;

    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Studio Ghibli Vibrant Anime Landscape Palette
    const ghibliLushGrass = new THREE.Color(0x56a635);
    const ghibliDeepForest = new THREE.Color(0x2f6b28);
    const ghibliChartreuse = new THREE.Color(0x7ac242);
    const ghibliTrailOchre = new THREE.Color(0xa66c42);
    const ghibliTrailRut = new THREE.Color(0x7a4a2b);
    const ghibliMudBog = new THREE.Color(0x4a3220);
    const ghibliGranite = new THREE.Color(0x767882);
    const ghibliServicePad = new THREE.Color(0x3a4249);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const y = this.getTerrainHeight(x, z);
      pos.setY(i, y);

      const col = new THREE.Color();
      const distS1 = Math.hypot(x - 22, z - 8);
      const distS2 = Math.hypot(x - (-85), z - (-60));
      const distTrail = this.getTrailDistance(x, z);

      if (distS1 < 18 || distS2 < 16) {
        col.copy(ghibliServicePad);
      } else if (y > 18) {
        const rockMix = Math.min(1.0, (y - 18) / 16.0);
        col.copy(ghibliGranite).lerp(new THREE.Color(0x8e929a), rockMix * 0.3);
      } else if (x < -36 && x > -68 && Math.abs(z) < 28) {
        col.copy(ghibliMudBog);
      } else if (distTrail < 5.0) {
        const t = distTrail / 5.0;
        const rutEdge = Math.abs(distTrail - 2.2);
        if (rutEdge < 1.0) {
          col.copy(ghibliTrailRut).lerp(ghibliTrailOchre, rutEdge);
        } else {
          col.copy(ghibliTrailOchre).lerp(ghibliLushGrass, Math.pow(t, 2.5));
        }
      } else {
        const grassNoise = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 0.5 + 0.5;
        const sunlitNoise = Math.sin(x * 0.08 + z * 0.06) * 0.5 + 0.5;
        col.copy(ghibliDeepForest).lerp(ghibliLushGrass, grassNoise);
        if (sunlitNoise > 0.65) {
          col.lerp(ghibliChartreuse, (sunlitNoise - 0.65) * 1.5);
        }
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const texLoader = new THREE.TextureLoader();
    const diffMap = texLoader.load('/assets/textures/terrain/mud_diff_1k.jpg');
    diffMap.wrapS = THREE.RepeatWrapping;
    diffMap.wrapT = THREE.RepeatWrapping;
    diffMap.repeat.set(32, 32);

    const norMap = texLoader.load('/assets/textures/terrain/mud_nor_1k.jpg');
    norMap.wrapS = THREE.RepeatWrapping;
    norMap.wrapT = THREE.RepeatWrapping;
    norMap.repeat.set(32, 32);

    const roughMap = texLoader.load('/assets/textures/terrain/mud_rough_1k.jpg');
    roughMap.wrapS = THREE.RepeatWrapping;
    roughMap.wrapT = THREE.RepeatWrapping;
    roughMap.repeat.set(32, 32);

    diffMap.anisotropy = 4;
    norMap.anisotropy = 4;
    roughMap.anisotropy = 4;

    const mat = new THREE.MeshStandardMaterial({
      map: diffMap,
      normalMap: norMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: roughMap,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.02
    });

    const terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    this.mesh.add(terrainMesh);

    // Trimesh physics collider
    const vertices = new Float32Array(pos.array);
    const indices = new Uint32Array(geo.index!.array);
    const bodyDesc = this.rapier.RigidBodyDesc.fixed();
    const terrainBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.trimesh(vertices, indices).setFriction(0.85);
    this.world.createCollider(colliderDesc, terrainBody);
  }

  /**
   * Crystalline Mountain Creek
   */
  private buildGhibliMountainCreek() {
    const waterGeo = new THREE.PlaneGeometry(44, 90, 16, 16);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x22a8b8,
      roughness: 0.12,
      metalness: 0.05,
      transmission: 0.72,
      opacity: 0.88,
      transparent: true,
      ior: 1.333
    });

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(-52, -2.4, 0);
    this.waterMesh.receiveShadow = true;
    this.mesh.add(this.waterMesh);
  }

  /**
   * Submerged Granite Riverbed Boulders in the Mountain Creek Crossing
   */
  private buildRiverWaterRocks() {
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x3d4e4f, // Wet dark mossy river stone
      roughness: 0.45, // Slick wet surface
      metalness: 0.1
    });

    const count = 26;
    const instancedRocks = new THREE.InstancedMesh(rockGeo, rockMat, count);
    instancedRocks.castShadow = true;
    instancedRocks.receiveShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      // Scatter in the river crossing corridor
      const x = -52 + (Math.random() - 0.5) * 22;
      const z = (Math.random() - 0.5) * 44;
      const groundY = this.getTerrainHeight(x, z);

      const scaleX = 1.0 + Math.random() * 1.6;
      const scaleY = 0.5 + Math.random() * 0.7; // Flattened river stone
      const scaleZ = 1.0 + Math.random() * 1.5;

      const rockY = groundY + scaleY * 0.45;

      dummy.position.set(x, rockY, z);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
      dummy.updateMatrix();

      instancedRocks.setMatrixAt(i, dummy.matrix);

      // Rapier physical collider for river boulder
      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, rockY, z);
      const b = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cuboid(scaleX * 0.85, scaleY * 0.85, scaleZ * 0.85)
        .setFriction(0.65)
        .setRestitution(0.05);
      this.world.createCollider(col, b);
    }

    instancedRocks.instanceMatrix.needsUpdate = true;
    this.mesh.add(instancedRocks);
  }

  /**
   * Massive Fallen Tree Logs Across Dirt Trails & Forest Pass
   */
  private buildFallenLogObstacles() {
    const logMat = new THREE.MeshStandardMaterial({
      color: 0x482d1c, // Weathered timber bark
      roughness: 0.88
    });

    const logGeo = new THREE.CylinderGeometry(0.48, 0.52, 9.5, 10);
    logGeo.rotateZ(Math.PI / 2); // Lay horizontal

    // Key obstacle locations directly challenging the 6x6 suspension & crawl torque
    const logObstacles = [
      // 1. Double log hurdle on the North Trail (x: 0, z: -42)
      { pos: new THREE.Vector3(0, 0, -42), rotY: 0.15, radius: 0.48, len: 9.0 },
      { pos: new THREE.Vector3(0.5, 0, -45.5), rotY: -0.1, radius: 0.52, len: 9.5 },

      // 2. Diagonal log obstacle across the Mud Ravine Descent
      { pos: new THREE.Vector3(-68, 0, -32), rotY: 0.65, radius: 0.55, len: 10.0 },

      // 3. High Logging Pass Fallen Tree (x: -35, z: -76)
      { pos: new THREE.Vector3(-35, 0, -76), rotY: -0.4, radius: 0.50, len: 9.5 },

      // 4. South Meadow Bog Log Step-up (x: -18, z: 42)
      { pos: new THREE.Vector3(-18, 0, 42), rotY: 0.3, radius: 0.48, len: 9.0 }
    ];

    logObstacles.forEach((obs) => {
      const groundY = this.getTerrainHeight(obs.pos.x, obs.pos.z);
      const logMesh = new THREE.Mesh(logGeo, logMat);
      logMesh.position.set(obs.pos.x, groundY + obs.radius * 0.85, obs.pos.z);
      logMesh.rotation.y = obs.rotY;
      logMesh.scale.set(obs.len / 9.5, obs.radius / 0.5, obs.radius / 0.5);
      logMesh.castShadow = true;
      logMesh.receiveShadow = true;
      this.mesh.add(logMesh);

      // Real Rapier physics cylinder collider
      const bodyDesc = this.rapier.RigidBodyDesc.fixed()
        .setTranslation(obs.pos.x, groundY + obs.radius * 0.85, obs.pos.z)
        .setRotation(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, obs.rotY, 0))
        );
      const b = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cuboid(obs.len * 0.48, obs.radius, obs.radius)
        .setFriction(0.88);
      this.world.createCollider(col, b);
    });
  }

  /**
   * Heavy Concrete & Stone Rally Barrier Blocks forming chicanes and cliff guards
   */
  private buildBarrierBlocksAndChicanes() {
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0x989a9c, // Weathered concrete block
      roughness: 0.92,
      metalness: 0.05
    });

    const blockGeo = new THREE.BoxGeometry(2.2, 0.95, 0.85);

    // Chicane setups on the trail to test high-speed slalom and braking
    const barrierPositions = [
      // Chicane 1 on Trailhead straight (z: 10 to -15)
      { pos: new THREE.Vector3(-3.2, 0, -8), rotY: 0.2 },
      { pos: new THREE.Vector3(3.4, 0, -18), rotY: -0.25 },

      // Mountain Outpost Hairpin Protection Barriers
      { pos: new THREE.Vector3(-72, 0, -68), rotY: 0.8 },
      { pos: new THREE.Vector3(-75, 0, -71), rotY: 0.8 },
      { pos: new THREE.Vector3(-78, 0, -74), rotY: 0.8 },

      // East Hill Climb Cliffside Guard Blocks
      { pos: new THREE.Vector3(32, 0, -12), rotY: 0.4 },
      { pos: new THREE.Vector3(34, 0, -14), rotY: 0.4 },
      { pos: new THREE.Vector3(58, 0, -22), rotY: -0.5 },
      { pos: new THREE.Vector3(61, 0, -24), rotY: -0.5 }
    ];

    barrierPositions.forEach((b) => {
      const groundY = this.getTerrainHeight(b.pos.x, b.pos.z);
      const blockMesh = new THREE.Mesh(blockGeo, blockMat);
      blockMesh.position.set(b.pos.x, groundY + 0.47, b.pos.z);
      blockMesh.rotation.y = b.rotY;
      blockMesh.castShadow = true;
      blockMesh.receiveShadow = true;
      this.mesh.add(blockMesh);

      const bodyDesc = this.rapier.RigidBodyDesc.fixed()
        .setTranslation(b.pos.x, groundY + 0.47, b.pos.z)
        .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.rotY, 0)));
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cuboid(1.1, 0.47, 0.42)
        .setFriction(0.7)
        .setRestitution(0.1);
      this.world.createCollider(col, body);
    });
  }

  /**
   * Technical Rock Crawl Section (Tiered granite slabs on the eastern ridge)
   */
  private buildRockCrawlSection() {
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x585a62,
      roughness: 0.88,
      metalness: 0.08
    });

    const slabGeo = new THREE.BoxGeometry(4.2, 0.65, 3.2);

    // 8 stepped rock crawl slabs on the ridge ascent (x: 52 to 74, z: -22 to -2)
    for (let s = 0; s < 8; s++) {
      const t = s / 7.0;
      const x = 52 + t * 22;
      const z = -22 + t * 20;
      const groundY = this.getTerrainHeight(x, z);

      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      const slabY = groundY + 0.25;
      slabMesh.position.set(x, slabY, z);
      slabMesh.rotation.set((Math.random() - 0.5) * 0.15, Math.random() * 0.4, (Math.random() - 0.5) * 0.15);
      slabMesh.castShadow = true;
      slabMesh.receiveShadow = true;
      this.mesh.add(slabMesh);

      const bodyDesc = this.rapier.RigidBodyDesc.fixed()
        .setTranslation(x, slabY, z)
        .setRotation(slabMesh.quaternion);
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cuboid(2.1, 0.32, 1.6)
        .setFriction(0.92);
      this.world.createCollider(col, body);
    }
  }

  /**
   * Dense Deep Forest Slalom Zone with Weathered Tree Stumps
   */
  private buildDeepForestZoneAndStumps() {
    const stumpMat = new THREE.MeshStandardMaterial({
      color: 0x3a2416, // Dark wet mossy stump
      roughness: 0.95
    });

    const stumpGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.65, 8);
    const count = 18;
    const instancedStumps = new THREE.InstancedMesh(stumpGeo, stumpMat, count);
    instancedStumps.castShadow = true;
    instancedStumps.receiveShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      // In northwest deep forest basin (x: -80 to -40, z: -85 to -45)
      const x = -40 - Math.random() * 42;
      const z = -45 - Math.random() * 40;
      const distTrail = this.getTrailDistance(x, z);
      if (distTrail < 5.5) continue;

      const groundY = this.getTerrainHeight(x, z);
      const scale = 0.8 + Math.random() * 0.5;
      const stumpY = groundY + 0.32 * scale;

      dummy.position.set(x, stumpY, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set((Math.random() - 0.5) * 0.1, Math.random() * Math.PI, (Math.random() - 0.5) * 0.1);
      dummy.updateMatrix();

      instancedStumps.setMatrixAt(i, dummy.matrix);

      // Real Rapier cylinder collider
      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, stumpY, z);
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cylinder(0.32 * scale, 0.6 * scale).setFriction(0.85);
      this.world.createCollider(col, body);
    }

    instancedStumps.instanceMatrix.needsUpdate = true;
    this.mesh.add(instancedStumps);
  }

  /**
   * Instanced Painterly Ghibli Grass Blades along trail borders and meadows
   */
  private buildGhibliPainterlyGrass() {
    const grassCount = 1800;
    const bladeGeo = new THREE.PlaneGeometry(0.7, 1.2, 1, 2);
    bladeGeo.translate(0, 0.6, 0);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x5ab838,
      roughness: 0.8,
      side: THREE.DoubleSide,
      alphaTest: 0.15
    });

    this.grassMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, grassCount);
    this.grassMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;

    while (placed < grassCount && attempts < 5000) {
      attempts++;
      const x = (Math.random() - 0.5) * 320;
      const z = (Math.random() - 0.5) * 320;

      const distTrail = this.getTrailDistance(x, z);
      if (distTrail < 4.2 || distTrail > 18.0) continue;

      const groundY = this.getTerrainHeight(x, z);
      if (groundY > 16.0 || groundY < -1.5) continue;

      const scale = 0.7 + Math.random() * 0.6;
      dummy.position.set(x, groundY, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.updateMatrix();

      this.grassMesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }

    this.grassMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(this.grassMesh);
  }

  /**
   * Realistic, Lush Nordic Pine Trees (Loaded from GLB with procedural fallback)
   */
  private buildLushPineForest() {
    const treeCount = 240;

    const trunkHeight = 11.0;
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.65, trunkHeight, 8);
    trunkGeo.translate(0, trunkHeight * 0.5, 0);

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
      color: 0x24552b,
      roughness: 0.82,
      metalness: 0.05
    });

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x3e281a,
      roughness: 0.95
    });

    const foliageMesh = new THREE.InstancedMesh(mergedFoliageGeo, foliageMat, treeCount);
    foliageMesh.castShadow = true;
    foliageMesh.receiveShadow = true;

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const realDummy = new THREE.Object3D();
    const realMatrices: THREE.Matrix4[] = [];

    let placed = 0;
    let attempts = 0;

    while (placed < treeCount && attempts < 2200) {
      attempts++;
      const x = (Math.random() - 0.5) * 350;
      const z = (Math.random() - 0.5) * 350;

      const distS1 = Math.hypot(x - 22, z - 8);
      const distS2 = Math.hypot(x - (-85), z - (-60));
      const distTrail = this.getTrailDistance(x, z);

      if (distS1 < 24 || distS2 < 22) continue;
      if (distTrail < 6.5) continue;
      if (x < -36 && x > -68 && Math.abs(z) < 26) continue;

      const groundY = this.getTerrainHeight(x, z);
      if (groundY > 24) continue;

      const baseScale = 0.8 + Math.random() * 0.55;
      const rotY = Math.random() * Math.PI * 2;

      dummy.position.set(x, groundY - 0.5 * baseScale, z);
      dummy.scale.set(baseScale, baseScale, baseScale);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(placed, dummy.matrix);
      foliageMesh.setMatrixAt(placed, dummy.matrix);

      const gltfScale = baseScale * 3.0;
      realDummy.position.set(x, groundY - 0.15, z);
      realDummy.scale.set(gltfScale, gltfScale, gltfScale);
      realDummy.rotation.set(0, rotY, 0);
      realDummy.updateMatrix();
      realMatrices.push(realDummy.matrix.clone());

      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
        x,
        groundY + 3.0 * baseScale,
        z
      );
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.cylinder(3.5 * baseScale, 0.45 * baseScale);
      this.world.createCollider(col, body);

      placed++;
    }

    foliageMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(trunkMesh, foliageMesh);

    const loader = new GLTFLoader();
    loader.load(
      '/assets/models/pine_tree.glb',
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        let realTrunkGeo: THREE.BufferGeometry | null = null;
        let realTrunkMat: THREE.Material | null = null;
        let realFoliageGeo: THREE.BufferGeometry | null = null;
        let realFoliageMat: THREE.Material | null = null;

        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const name = mesh.name.toLowerCase();
            const bakedGeo = mesh.geometry.clone();
            bakedGeo.applyMatrix4(mesh.matrixWorld);

            if (name.includes('tree_0') || name.includes('trunk')) {
              realTrunkGeo = bakedGeo;
              realTrunkMat = mesh.material as THREE.Material;
            } else if (name.includes('tree_1') || name.includes('foliage') || name.includes('mat')) {
              realFoliageGeo = bakedGeo;
              realFoliageMat = mesh.material as THREE.Material;
            }
          }
        });

        if (realTrunkGeo && realFoliageGeo && realTrunkMat && realFoliageMat) {
          this.mesh.remove(trunkMesh, foliageMesh);
          trunkMesh.geometry.dispose();
          foliageMesh.geometry.dispose();

          const folMatStd = realFoliageMat as THREE.MeshStandardMaterial;
          folMatStd.alphaTest = 0.22;
          folMatStd.transparent = false;
          folMatStd.depthWrite = true;
          folMatStd.side = THREE.DoubleSide;
          folMatStd.roughness = 0.85;

          const trkMatStd = realTrunkMat as THREE.MeshStandardMaterial;
          trkMatStd.roughness = 0.95;

          const realTrunkInstanced = new THREE.InstancedMesh(realTrunkGeo, realTrunkMat, realMatrices.length);
          const realFoliageInstanced = new THREE.InstancedMesh(realFoliageGeo, realFoliageMat, realMatrices.length);
          realTrunkInstanced.castShadow = true;
          realTrunkInstanced.receiveShadow = true;
          realFoliageInstanced.castShadow = true;
          realFoliageInstanced.receiveShadow = true;

          for (let i = 0; i < realMatrices.length; i++) {
            realTrunkInstanced.setMatrixAt(i, realMatrices[i]);
            realFoliageInstanced.setMatrixAt(i, realMatrices[i]);
          }

          realTrunkInstanced.instanceMatrix.needsUpdate = true;
          realFoliageInstanced.instanceMatrix.needsUpdate = true;
          this.mesh.add(realTrunkInstanced, realFoliageInstanced);
        }
      },
      undefined,
      (err) => {
        console.warn('[ForestStageMap] Error loading pine_tree.glb, keeping high-poly procedural trees:', err);
      }
    );
  }

  /**
   * Granite Boulders & Rock Outcrops along Hillslopes
   */
  private buildGraniteBoulders() {
    const rockCount = 60;
    const rockGeo = new THREE.DodecahedronGeometry(1.6, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5a5c64,
      roughness: 0.88,
      metalness: 0.05
    });

    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;

    for (let i = 0; i < rockCount; i++) {
      const angle = (i / rockCount) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 45 + Math.random() * 120;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const distTrail = this.getTrailDistance(x, z);
      if (distTrail < 5.0) continue;

      const groundY = this.getTerrainHeight(x, z);
      const scale = 0.9 + Math.random() * 1.8;

      dummy.position.set(x, groundY + 0.3 * scale, z);
      dummy.scale.set(scale * 1.2, scale * 0.75, scale);
      dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
      dummy.updateMatrix();

      rockMesh.setMatrixAt(placed, dummy.matrix);

      const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, groundY + 0.6 * scale, z);
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.ball(1.1 * scale);
      this.world.createCollider(col, body);

      placed++;
    }

    rockMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(rockMesh);
  }

  /**
   * Rustic Timber Rally Gates & Bridges
   */
  private buildRallyObstaclesAndBridges() {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x563824,
      roughness: 0.85
    });

    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0xd93829,
      roughness: 0.7
    });

    // 1. Trailhead Start Gate at (0, 0, 18)
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, 18);

    const postGeo = new THREE.CylinderGeometry(0.35, 0.4, 6.5, 8);
    const postL = new THREE.Mesh(postGeo, woodMat);
    postL.position.set(-5.5, 3.25, 0);
    postL.castShadow = true;

    const postR = new THREE.Mesh(postGeo, woodMat);
    postR.position.set(5.5, 3.25, 0);
    postR.castShadow = true;

    const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, 12.0, 8);
    const beam = new THREE.Mesh(beamGeo, woodMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0, 6.0, 0);
    beam.castShadow = true;

    const bannerGeo = new THREE.PlaneGeometry(8.5, 1.4);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 5.0, 0);

    gateGroup.add(postL, postR, beam, banner);
    this.mesh.add(gateGroup);

    const postColL = this.rapier.ColliderDesc.cylinder(3.25, 0.4);
    const bodyL = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(-5.5, 3.25, 18));
    this.world.createCollider(postColL, bodyL);

    const postColR = this.rapier.ColliderDesc.cylinder(3.25, 0.4);
    const bodyR = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(5.5, 3.25, 18));
    this.world.createCollider(postColR, bodyR);

    // 2. Corduroy Log Bridge over Mud Ravine at (-52, -1.8, 22)
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(-52, -1.8, 22);

    const logCount = 14;
    const logGeo = new THREE.CylinderGeometry(0.28, 0.30, 8.5, 8);
    logGeo.rotateZ(Math.PI / 2);

    for (let l = 0; l < logCount; l++) {
      const log = new THREE.Mesh(logGeo, woodMat);
      log.position.set(0, 0, (l - logCount * 0.5) * 0.7);
      log.castShadow = true;
      log.receiveShadow = true;
      bridgeGroup.add(log);
    }

    this.mesh.add(bridgeGroup);

    const bridgeCol = this.rapier.ColliderDesc.cuboid(4.25, 0.3, logCount * 0.35 + 0.5);
    const bridgeBody = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(-52, -1.8, 22)
    );
    this.world.createCollider(bridgeCol, bridgeBody);
  }

  /**
   * Functional Alpine Petrol Stations
   */
  private buildGasStations() {
    this.gasStations = [
      { pos: new THREE.Vector3(22, 0, 8), radius: 14 },
      { pos: new THREE.Vector3(-85, 1.8, -60), radius: 14 }
    ];

    this.gasStations.forEach((station) => {
      const stationGroup = new THREE.Group();
      stationGroup.position.copy(station.pos);

      const padGeo = new THREE.CylinderGeometry(12, 12, 0.05, 32);
      const padMat = new THREE.MeshStandardMaterial({
        color: 0x363a40,
        roughness: 0.85
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.y = 0.025;
      padMesh.receiveShadow = true;
      stationGroup.add(padMesh);

      const woodMat = new THREE.MeshStandardMaterial({ color: 0x4d3222, roughness: 0.85 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x224838, roughness: 0.6 });

      const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 5.0, 8);
      const poles = [
        new THREE.Vector3(-4.5, 2.5, -4.5),
        new THREE.Vector3(4.5, 2.5, -4.5),
        new THREE.Vector3(-4.5, 2.5, 4.5),
        new THREE.Vector3(4.5, 2.5, 4.5)
      ];

      poles.forEach((p) => {
        const pole = new THREE.Mesh(poleGeo, woodMat);
        pole.position.copy(p);
        pole.castShadow = true;
        stationGroup.add(pole);

        const col = this.rapier.ColliderDesc.cylinder(2.5, 0.25);
        const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
          station.pos.x + p.x,
          station.pos.y + 2.5,
          station.pos.z + p.z
        );
        const b = this.world.createRigidBody(bodyDesc);
        this.world.createCollider(col, b);
      });

      const roofGeo = new THREE.BoxGeometry(11, 0.45, 11);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(0, 5.2, 0);
      roof.castShadow = true;
      stationGroup.add(roof);

      const pumpGeo = new THREE.BoxGeometry(1.0, 2.2, 0.9);
      const pumpMat = new THREE.MeshStandardMaterial({
        color: 0xd64434,
        roughness: 0.4,
        metalness: 0.3
      });

      [-2.2, 2.2].forEach((offsetZ) => {
        const pump = new THREE.Mesh(pumpGeo, pumpMat);
        pump.position.set(0, 1.1, offsetZ);
        pump.castShadow = true;
        stationGroup.add(pump);

        const pumpCol = this.rapier.ColliderDesc.cuboid(0.5, 1.1, 0.45);
        const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(
          station.pos.x,
          station.pos.y + 1.1,
          station.pos.z + offsetZ
        );
        const b = this.world.createRigidBody(bodyDesc);
        this.world.createCollider(pumpCol, b);
      });

      const lanternLight = new THREE.PointLight(0xffb555, 3.0, 18.0);
      lanternLight.position.set(0, 4.2, 0);
      stationGroup.add(lanternLight);

      this.mesh.add(stationGroup);
    });
  }
}

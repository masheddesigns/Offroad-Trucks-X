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

export interface TrailInfo {
  dist: number;
  isMudSection: boolean;
  isRiverCrossing: boolean;
  isCorner: boolean;
  tangent: THREE.Vector3;
  point: THREE.Vector3;
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
  public readonly playableRadius: number = 190;// 190m active valley floor before mountain ridges rise

  // Continuous Off-Road Track Curve
  public trackCurve!: THREE.CatmullRomCurve3;
  public trackPoints: THREE.Vector3[] = [];
  public trackTangents: THREE.Vector3[] = [];

  constructor(rapier: typeof RAPIER, world: RAPIER.World) {
    this.rapier = rapier;
    this.world = world;
    this.mesh = new THREE.Group();

    // 1. Initialize Continuous Closed-Loop Off-Road Rally Circuit
    this.buildTrackSpline();

    // 2. Terrain & Environment
    this.buildTerrain();
    this.buildGhibliMountainCreek();
    this.buildMudPuddles();
    this.buildLushDeepPineForest();
    this.buildGhibliPainterlyGrass();
    this.buildGraniteBoulders();
    this.buildGasStations();

    // 3. Physical Obstacles & Rally Course Infrastructure
    this.buildRallyStartGate();
    this.buildRallyCornerMarkersAndTireStacks();
    this.buildRiverWaterRocks();
    this.buildFallenLogObstacles();
    this.buildBarrierBlocksAndChicanes();
    this.buildDeepForestZoneAndStumps();
    this.buildRockCrawlSection();
    this.buildRallyJumpRamps();
  }

  /**
   * Builds the authoritative 430m closed-loop off-road rally circuit spline
   */
  private buildTrackSpline() {
    const rawWaypoints = [
      new THREE.Vector3(0, 0, 20),     // WP0: Start/Finish Gate
      new THREE.Vector3(2, 0, -15),    // WP1: Pine Corridor Entry
      new THREE.Vector3(14, 0, -38),   // WP2: S-Bend Chicane
      new THREE.Vector3(-4, 0, -62),   // WP3: Mud Gully Descent
      new THREE.Vector3(-25, 0, -84),  // WP4: Deep Mud Rut Trench
      new THREE.Vector3(-58, 0, -86),  // WP5: North Logging Pass
      new THREE.Vector3(-85, 0, -74),  // WP6: Mountain Outpost Hairpin
      new THREE.Vector3(-92, 0, -48),  // WP7: High Ridge Switchback
      new THREE.Vector3(-78, 0, -22),  // WP8: Rocky Canyon Descent
      new THREE.Vector3(-54, 0, -4),   // WP9: River Crossing Approach
      new THREE.Vector3(-50, 0, 16),   // WP10: River Ford Splashdown
      new THREE.Vector3(-36, 0, 42),   // WP11: Corduroy Log Bridge
      new THREE.Vector3(-10, 0, 54),   // WP12: South High-Speed Sweeper
      new THREE.Vector3(24, 0, 48),    // WP13: East Meadow Arc
      new THREE.Vector3(18, 0, 28)     // WP14: Final Hairpin onto Start Straight
    ];

    this.trackCurve = new THREE.CatmullRomCurve3(rawWaypoints, true, 'centripetal');
    const sampleCount = 280;
    this.trackPoints = this.trackCurve.getPoints(sampleCount);

    for (let i = 0; i < this.trackPoints.length; i++) {
      const u = i / this.trackPoints.length;
      this.trackTangents.push(this.trackCurve.getTangent(u));
    }
  }

  /**
   * Distance and geometric attributes to the off-road rally circuit
   */
  public getTrailInfo(x: number, z: number): TrailInfo {
    let minD2 = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < this.trackPoints.length; i++) {
      const p = this.trackPoints[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) {
        minD2 = d2;
        closestIdx = i;
      }
    }

    const dist = Math.sqrt(minD2);
    const p = this.trackPoints[closestIdx];

    // Identify track sectors
    const isMudSection = (p.z < -45 && p.z > -90 && p.x > -65 && p.x < 5);
    const isRiverCrossing = (p.x < -36 && p.x > -65 && p.z > -15 && p.z < 25);

    // Identify sharp corner sections for banking berms
    const prevIdx = (closestIdx - 4 + this.trackPoints.length) % this.trackPoints.length;
    const nextIdx = (closestIdx + 4) % this.trackPoints.length;
    const tPrev = this.trackTangents[prevIdx];
    const tNext = this.trackTangents[nextIdx];
    const curvature = 1.0 - Math.max(0, tPrev.dot(tNext));
    const isCorner = curvature > 0.15;

    return {
      dist,
      isMudSection,
      isRiverCrossing,
      isCorner,
      tangent: this.trackTangents[closestIdx],
      point: this.trackPoints[closestIdx]
    };
  }

  public getTrailDistance(x: number, z: number): number {
    return this.getTrailInfo(x, z).dist;
  }

  /**
   * Authoritative surface query for realistic vehicle tire physics
   */
  public getSurfaceAt(x: number, z: number): SurfaceInfo {
    const trail = this.getTrailInfo(x, z);

    // 1. Mountain Creek River Crossing
    if (trail.isRiverCrossing && trail.dist < 5.5) {
      return {
        type: 'water',
        friction: 0.50,
        rollingResistance: 0.62,
        depth: 0.45,
        bumpiness: 0.08
      };
    }

    // 2. Deep Mud Rut Trench
    if (trail.isMudSection && trail.dist < 5.0) {
      return {
        type: 'mud',
        friction: 0.52,
        rollingResistance: 0.48,
        depth: 0.32,
        bumpiness: 0.15
      };
    }

    // 3. Technical Rock Crawl Section (Eastern Slope)
    const y = this.getTerrainHeight(x, z);
    if (y > 18.0 || (x > 50 && x < 76 && z > -25 && z < 10)) {
      return {
        type: 'rock',
        friction: 0.92,
        rollingResistance: 0.08,
        depth: 0.0,
        bumpiness: 0.16
      };
    }

    // 4. Carved Packed Dirt Off-Road Track
    if (trail.dist < 4.8) {
      return {
        type: 'trail',
        friction: 0.98,
        rollingResistance: 0.05,
        depth: 0.02,
        bumpiness: 0.04
      };
    }

    // 5. Deep Forest Floor & Alpine Meadow
    return {
      type: 'grass',
      friction: 0.82,
      rollingResistance: 0.12,
      depth: 0.06,
      bumpiness: 0.06
    };
  }

  /**
   * Continuous, natural base terrain height (mountains, valley, creek, hills)
   * Guaranteed C1 smooth with zero step cliffs or discontinuous borders.
   */
  public getBaseLandscapeHeight(x: number, z: number): number {
    const distFromCenter = Math.hypot(x, z);

    // 1. Surrounding Alpine Mountain Amphitheater enclosing the 520m valley
    let mountainRidge = 0.0;
    if (distFromCenter > 170.0) {
      const norm = Math.min(1.0, (distFromCenter - 170.0) / 75.0);
      const ramp = norm * norm * (3.0 - 2.0 * norm); // Smoothstep 0 -> 1
      const mountainNoise =
        Math.sin(x * 0.045 + z * 0.035) * 3.5 +
        Math.cos(x * 0.07 - z * 0.055) * 2.0;
      mountainRidge = ramp * (42.0 + mountainNoise);
    }

    // 2. Rolling Forest Valley Floor (Smooth harmonics, max slope ~10-12 deg)
    const valleyRolling =
      Math.sin(x * 0.024) * Math.cos(z * 0.026) * 2.2 +
      Math.sin(x * 0.055 + 1.2) * Math.cos(z * 0.048 + 0.6) * 1.1;

    // 3. Gentle Western Mountain Ridge & Northern Logging Hills (Smooth Hermite Blends)
    const westDist = Math.max(0, (-x - 45.0) / 50.0);
    const westNorm = Math.min(1.0, westDist);
    const westH = westNorm * westNorm * (3.0 - 2.0 * westNorm) * 11.0;

    const northDist = Math.max(0, (-z - 45.0) / 50.0);
    const northNorm = Math.min(1.0, northDist);
    const northH = northNorm * northNorm * (3.0 - 2.0 * northNorm) * 9.0;

    // 4. Mountain Creek Ravine (Smooth Gaussian depression centered at x = -52)
    const creekDx = (x - (-52.0)) / 18.0;
    const creekDz = z / 45.0;
    const creekFalloff = Math.exp(-(creekDx * creekDx)) * Math.exp(-(creekDz * creekDz * creekDz * creekDz));
    const creekDepth = creekFalloff * 2.6; // Gentle 2.6m natural ravine bed

    let h = valleyRolling + westH + northH - creekDepth + mountainRidge;

    // 5. Smooth Flat Service Pads for Petrol Stations
    const distS1 = Math.hypot(x - 22, z - 8);
    if (distS1 < 22) {
      const blend = Math.min(1.0, distS1 / 22.0);
      const s1Factor = blend * blend * (3.0 - 2.0 * blend);
      h = THREE.MathUtils.lerp(0.0, h, s1Factor);
    }

    const distS2 = Math.hypot(x - (-85), z - (-60));
    if (distS2 < 20) {
      const blend = Math.min(1.0, distS2 / 20.0);
      const s2Factor = blend * blend * (3.0 - 2.0 * blend);
      h = THREE.MathUtils.lerp(2.0, h, s2Factor);
    }

    return h;
  }

  /**
   * Authoritative terrain height function:
   * Level rally track bed with smooth shoulders and zero knife-edge ruts
   */
  public getTerrainHeight(x: number, z: number): number {
    const baseH = this.getBaseLandscapeHeight(x, z);
    const trail = this.getTrailInfo(x, z);
    const d = trail.dist;

    const halfW = 4.6;   // 9.2m wide driveable rally road
    const blendW = 3.6;  // 3.6m smooth transition into surrounding meadow

    // If far from track, return natural base landscape
    if (d >= halfW + blendW) {
      return baseH;
    }

    // Height of the natural terrain along the track centerline at the closest waypoint
    const trackCenterH = this.getBaseLandscapeHeight(trail.point.x, trail.point.z);

    // Subtle 6cm road crowning (higher in the middle, sloping gently to shoulders)
    const crown = 0.06 * Math.max(0, 1.0 - (d / halfW) * (d / halfW));

    // Banked corner berms: assist turning on sharp hairpins
    let banking = 0.0;
    if (trail.isCorner) {
      const nx = -trail.tangent.z;
      const nz = trail.tangent.x;
      const signedLat = (x - trail.point.x) * nx + (z - trail.point.z) * nz;
      if (signedLat > 0) {
        banking = Math.min(0.40, (signedLat / halfW) * 0.40);
      }
    }

    // Sculpted dirt jump tabletops on straights
    let jumpRampH = 0.0;
    // Jump 1: North Logging straight (around x = -45, z = -86)
    const distJump1 = Math.hypot(trail.point.x - (-45), trail.point.z - (-86));
    if (distJump1 < 10.0) {
      const rampT = distJump1 / 10.0;
      jumpRampH = 1.15 * Math.cos(rampT * Math.PI * 0.5);
    }
    // Jump 2: South high-speed meadow straight (around x = 8, z = 52)
    const distJump2 = Math.hypot(trail.point.x - 8, trail.point.z - 52);
    if (distJump2 < 9.0) {
      const rampT = distJump2 / 9.0;
      jumpRampH = 0.95 * Math.cos(rampT * Math.PI * 0.5);
    }

    const roadBedH = trackCenterH + crown + banking + jumpRampH;

    // Inside the roadbed: road is flat, level, and solid
    if (d <= halfW) {
      return roadBedH;
    }

    // Road shoulder: smooth cubic Hermite blend from roadBedH to natural baseH
    const u = (d - halfW) / blendW;
    const blendFactor = u * u * (3.0 - 2.0 * u); // Smoothstep 0 to 1
    return THREE.MathUtils.lerp(roadBedH, baseH, blendFactor);
  }

  private buildTerrain() {
    const size = this.mapSize;
    const segs = 180; // High resolution for crisp track ruts

    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Studio Ghibli Vibrant Anime Landscape Palette
    const ghibliLushGrass = new THREE.Color(0x56a635);
    const ghibliDeepForest = new THREE.Color(0x285922);
    const ghibliChartreuse = new THREE.Color(0x7ac242);
    const ghibliTrailOchre = new THREE.Color(0xd4a373);  // Sunlit warm sand/gravel dirt trail
    const ghibliTrailRut = new THREE.Color(0x9c6644);    // Packed loam rut
    const ghibliMudBog = new THREE.Color(0x5a3d28);      // Muddy clay
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
      const trail = this.getTrailInfo(x, z);

      if (distS1 < 18 || distS2 < 16) {
        col.copy(ghibliServicePad);
      } else if (y > 18) {
        const rockMix = Math.min(1.0, (y - 18) / 16.0);
        col.copy(ghibliGranite).lerp(new THREE.Color(0x8e929a), rockMix * 0.3);
      } else if (trail.isRiverCrossing && trail.dist < 5.8) {
        col.copy(ghibliMudBog).lerp(new THREE.Color(0x283b3d), 0.4);
      } else if (trail.isMudSection && trail.dist < 5.2) {
        // Deep Mud Gully Section
        const t = trail.dist / 5.2;
        col.copy(ghibliMudBog).lerp(ghibliLushGrass, Math.pow(t, 2.5));
      } else if (trail.dist < 5.0) {
        // Broad packed gravel rally track with smooth grass shoulder
        const t = trail.dist / 5.0;
        col.copy(ghibliTrailOchre).lerp(ghibliLushGrass, Math.pow(t, 2.5));
      } else {
        // Deep forest loam and lush rolling meadow
        const grassNoise = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 0.5 + 0.5;
        const sunlitNoise = Math.sin(x * 0.08 + z * 0.06) * 0.5 + 0.5;
        col.copy(ghibliDeepForest).lerp(ghibliLushGrass, grassNoise);
        if (sunlitNoise > 0.68) {
          col.lerp(ghibliChartreuse, (sunlitNoise - 0.68) * 1.5);
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
    diffMap.repeat.set(34, 34);

    const norMap = texLoader.load('/assets/textures/terrain/mud_nor_1k.jpg');
    norMap.wrapS = THREE.RepeatWrapping;
    norMap.wrapT = THREE.RepeatWrapping;
    norMap.repeat.set(34, 34);

    const roughMap = texLoader.load('/assets/textures/terrain/mud_rough_1k.jpg');
    roughMap.wrapS = THREE.RepeatWrapping;
    roughMap.wrapT = THREE.RepeatWrapping;
    roughMap.repeat.set(34, 34);

    diffMap.anisotropy = 4;
    norMap.anisotropy = 4;
    roughMap.anisotropy = 4;

    const mat = new THREE.MeshStandardMaterial({
      map: diffMap,
      normalMap: norMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
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
    const colliderDesc = this.rapier.ColliderDesc.trimesh(vertices, indices).setFriction(0.88);
    this.world.createCollider(colliderDesc, terrainBody);
  }

  /**
   * Crystalline Mountain Creek River Crossing
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
   * Reflective Mud Puddle Meshes in the Mud Trench Ruts
   */
  private buildMudPuddles() {
    const puddleGeo = new THREE.PlaneGeometry(3.5, 6.0, 4, 4);
    puddleGeo.rotateX(-Math.PI / 2);

    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x3d2818, // Muddy water
      roughness: 0.08,
      metalness: 0.15
    });

    // 6 mud puddles along the mud gully track section
    const puddlePoints = [
      new THREE.Vector3(-8, 0, -68),
      new THREE.Vector3(-18, 0, -78),
      new THREE.Vector3(-32, 0, -85),
      new THREE.Vector3(-48, 0, -86),
      new THREE.Vector3(-72, 0, -80),
      new THREE.Vector3(-88, 0, -62)
    ];

    puddlePoints.forEach((pt) => {
      const y = this.getTerrainHeight(pt.x, pt.z);
      const pMesh = new THREE.Mesh(puddleGeo, puddleMat);
      pMesh.position.set(pt.x, y + 0.03, pt.z);
      pMesh.receiveShadow = true;
      this.mesh.add(pMesh);
    });
  }

  /**
   * Massive Dense Deep Forest (1,600+ Trees creating canopy tunnels along the track)
   */
  private buildLushDeepPineForest() {
    const treeCount = 1600;

    // Procedural Fallback Geometries
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
      color: 0x225528,
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

    // 1. DENSE CORRIDOR TREES: Line both sides of the 430m off-road track!
    // Creates a continuous canopy tunnel where you drive between massive pine trees
    for (let i = 0; i < this.trackPoints.length; i += 2) {
      if (placed >= treeCount) break;

      const p = this.trackPoints[i];
      const tangent = this.trackTangents[i];
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // Left shoulder tree & Right shoulder tree
      const sides = [-1, 1];
      for (const s of sides) {
        if (placed >= treeCount) break;

        const shoulderDist = 4.4 + Math.random() * 5.2; // 4.4m to 9.6m from centerline
        const tx = p.x + normal.x * shoulderDist * s + (Math.random() - 0.5) * 1.5;
        const tz = p.z + normal.z * shoulderDist * s + (Math.random() - 0.5) * 1.5;

        // Skip gas stations
        if (Math.hypot(tx - 22, tz - 8) < 22 || Math.hypot(tx - (-85), tz - (-60)) < 20) continue;
        if (tx < -38 && tx > -66 && Math.abs(tz) < 20) continue; // Keep river ford open

        const groundY = this.getTerrainHeight(tx, tz);
        const baseScale = 0.85 + Math.random() * 0.55;
        const rotY = Math.random() * Math.PI * 2;

        dummy.position.set(tx, groundY - 0.5 * baseScale, tz);
        dummy.scale.set(baseScale, baseScale, baseScale);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        trunkMesh.setMatrixAt(placed, dummy.matrix);
        foliageMesh.setMatrixAt(placed, dummy.matrix);

        const gltfScale = baseScale * 3.0;
        realDummy.position.set(tx, groundY - 0.15, tz);
        realDummy.scale.set(gltfScale, gltfScale, gltfScale);
        realDummy.rotation.set(0, rotY, 0);
        realDummy.updateMatrix();
        realMatrices.push(realDummy.matrix.clone());

        // Physics trunk collider
        const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(tx, groundY + 3.0 * baseScale, tz);
        const body = this.world.createRigidBody(bodyDesc);
        const col = this.rapier.ColliderDesc.cylinder(3.5 * baseScale, 0.45 * baseScale);
        this.world.createCollider(col, body);

        placed++;
      }
    }

    // 2. DEEP OLD-GROWTH FOREST INTERIOR: Fill the forest basins and mountain ridges
    let attempts = 0;
    while (placed < treeCount && attempts < 6000) {
      attempts++;
      const x = (Math.random() - 0.5) * 360;
      const z = (Math.random() - 0.5) * 360;

      const trail = this.getTrailInfo(x, z);
      if (trail.dist < 5.2) continue; // Keep track clear
      if (Math.hypot(x - 22, z - 8) < 22 || Math.hypot(x - (-85), z - (-60)) < 20) continue;
      if (x < -38 && x > -66 && Math.abs(z) < 22) continue;

      const groundY = this.getTerrainHeight(x, z);
      if (groundY > 26) continue;

      const baseScale = 0.75 + Math.random() * 0.65;
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

      // Only create Rapier physics colliders for reachable trees near the track or deep forest slalom
      const isNearDrivableArea = trail.dist < 20.0 || (x > -90 && x < -35 && z > -90 && z < -40);
      if (isNearDrivableArea) {
        const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, groundY + 3.0 * baseScale, z);
        const body = this.world.createRigidBody(bodyDesc);
        const col = this.rapier.ColliderDesc.cylinder(3.5 * baseScale, 0.45 * baseScale);
        this.world.createCollider(col, body);
      }

      placed++;
    }

    foliageMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.needsUpdate = true;
    this.mesh.add(trunkMesh, foliageMesh);

    // Asynchronously load and instantiate photorealistic 3D scanned Pine Trees
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
          // Immediately release procedural placeholder memory from GPU & CPU
          this.mesh.remove(trunkMesh, foliageMesh);
          trunkMesh.geometry.dispose();
          foliageMesh.geometry.dispose();
          trunkMat.dispose();
          foliageMat.dispose();

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
   * Rally Directional Arrows & Tire Stacks Marking the Circuit
   */
  private buildRallyCornerMarkersAndTireStacks() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5a3e2a, roughness: 0.9 });
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xdd2211, roughness: 0.5 }); // Red chevron
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x222224, roughness: 0.85 }); // Rubber

    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6);
    const signGeo = new THREE.BoxGeometry(1.2, 0.7, 0.05);
    const tireGeo = new THREE.TorusGeometry(0.48, 0.22, 8, 12);
    tireGeo.rotateX(Math.PI / 2);

    // Place directional arrows on all 14 corner apexes
    for (let i = 0; i < this.trackPoints.length; i += 18) {
      const p = this.trackPoints[i];
      const tangent = this.trackTangents[i];
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // Outside shoulder of curve (safely off the 4.6m track driving line)
      const markerPos = p.clone().add(normal.clone().multiplyScalar(5.6));
      const groundY = this.getTerrainHeight(markerPos.x, markerPos.z);

      const signGroup = new THREE.Group();
      signGroup.position.set(markerPos.x, groundY, markerPos.z);
      signGroup.rotation.y = Math.atan2(tangent.x, tangent.z);

      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 1.1;
      post.castShadow = true;

      const sign = new THREE.Mesh(signGeo, arrowMat);
      sign.position.y = 1.7;
      sign.castShadow = true;

      signGroup.add(post, sign);
      this.mesh.add(signGroup);

      // Tire stack (3 stacked tires)
      for (let t = 0; t < 3; t++) {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.position.set(markerPos.x, groundY + 0.2 + t * 0.38, markerPos.z);
        tire.castShadow = true;
        this.mesh.add(tire);
      }
    }
  }

  /**
   * Start / Finish Rally Gateway with Checkered Banners
   */
  private buildRallyStartGate() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x563824, roughness: 0.85 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0xd93829, roughness: 0.7 });

    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, 20);

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
    const bodyL = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(-5.5, 3.25, 20));
    this.world.createCollider(postColL, bodyL);

    const postColR = this.rapier.ColliderDesc.cylinder(3.25, 0.4);
    const bodyR = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(5.5, 3.25, 20));
    this.world.createCollider(postColR, bodyR);
  }

  /**
   * Submerged Granite Riverbed Boulders in the Mountain Creek Crossing
   */
  private buildRiverWaterRocks() {
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x3d4e4f,
      roughness: 0.45,
      metalness: 0.1
    });

    const count = 28;
    const instancedRocks = new THREE.InstancedMesh(rockGeo, rockMat, count);
    instancedRocks.castShadow = true;
    instancedRocks.receiveShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = -52 + (Math.random() - 0.5) * 22;
      const z = (Math.random() - 0.5) * 44;
      const trail = this.getTrailInfo(x, z);
      if (trail.dist < 5.8) continue; // Keep the river crossing corridor clear for the truck!

      const groundY = this.getTerrainHeight(x, z);

      const scaleX = 1.0 + Math.random() * 1.6;
      const scaleY = 0.5 + Math.random() * 0.7;
      const scaleZ = 1.0 + Math.random() * 1.5;
      const rockY = groundY + scaleY * 0.45;

      dummy.position.set(x, rockY, z);
      dummy.scale.set(scaleX, scaleY, scaleZ);
      dummy.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
      dummy.updateMatrix();

      instancedRocks.setMatrixAt(i, dummy.matrix);

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
   * Semi-Buried Timber Log Crossings & Corduroy Hurdles
   * Embedded into the dirt road so 50-inch truck wheels roll over with an authentic rally rumble
   */
  private buildFallenLogObstacles() {
    const logMat = new THREE.MeshStandardMaterial({
      color: 0x482d1c,
      roughness: 0.88
    });

    const logGeo = new THREE.CylinderGeometry(0.32, 0.35, 9.5, 12);
    logGeo.rotateZ(Math.PI / 2);

    const logObstacles = [
      // 1. Double corduroy hurdle on North Straight (WP3)
      { pos: new THREE.Vector3(2, 0, -32), rotY: 0.15, radius: 0.28, len: 8.5 },
      { pos: new THREE.Vector3(3, 0, -35.5), rotY: -0.1, radius: 0.30, len: 9.0 },

      // 2. Diagonal log crossing across Mud Gully
      { pos: new THREE.Vector3(-15, 0, -74), rotY: 0.55, radius: 0.30, len: 9.2 },

      // 3. High Logging Pass Fallen Tree (WP5)
      { pos: new THREE.Vector3(-42, 0, -88), rotY: -0.3, radius: 0.28, len: 9.0 },

      // 4. South Meadow Corduroy Step (WP12)
      { pos: new THREE.Vector3(-22, 0, 48), rotY: 0.35, radius: 0.28, len: 8.5 }
    ];

    logObstacles.forEach((obs) => {
      const groundY = this.getTerrainHeight(obs.pos.x, obs.pos.z);
      const logMesh = new THREE.Mesh(logGeo, logMat);
      // Half-buried in dirt: only 0.12m crests above roadbed
      logMesh.position.set(obs.pos.x, groundY + 0.12, obs.pos.z);
      logMesh.rotation.y = obs.rotY;
      logMesh.scale.set(obs.len / 9.5, obs.radius / 0.32, obs.radius / 0.32);
      logMesh.castShadow = true;
      logMesh.receiveShadow = true;
      this.mesh.add(logMesh);

      const bodyDesc = this.rapier.RigidBodyDesc.fixed()
        .setTranslation(obs.pos.x, groundY + 0.10, obs.pos.z)
        .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, obs.rotY, 0)));
      const b = this.world.createRigidBody(bodyDesc);
      // Low rounded cuboid collider allowing smooth roll-over
      const col = this.rapier.ColliderDesc.roundCuboid(obs.len * 0.46, 0.10, 0.22, 0.08)
        .setFriction(0.92);
      this.world.createCollider(col, b);
    });
  }

  /**
   * Heavy Concrete & Stone Rally Cliff Guard Barriers (Protects against cliff drop-offs)
   */
  private buildBarrierBlocksAndChicanes() {
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0x989a9c,
      roughness: 0.92,
      metalness: 0.05
    });

    const blockGeo = new THREE.BoxGeometry(2.4, 0.95, 0.85);

    // Positioned along the outside edge of cliffs and outpost hairpin (outside the 5.5m road envelope)
    const barrierPositions = [
      // Mountain Outpost Hairpin Outer Shoulder Barriers
      { pos: new THREE.Vector3(-92, 0, -78), rotY: 0.8 },
      { pos: new THREE.Vector3(-95, 0, -74), rotY: 0.7 },
      { pos: new THREE.Vector3(-98, 0, -68), rotY: 0.5 },

      // High Switchback Cliffside Guard Blocks
      { pos: new THREE.Vector3(-102, 0, -42), rotY: 0.4 },
      { pos: new THREE.Vector3(-104, 0, -46), rotY: 0.4 },
      { pos: new THREE.Vector3(-102, 0, -36), rotY: 0.3 }
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
      const col = this.rapier.ColliderDesc.cuboid(1.2, 0.47, 0.42)
        .setFriction(0.6)
        .setRestitution(0.1);
      this.world.createCollider(col, body);
    });
  }

  /**
   * Technical Rock Crawl Section (Stepped granite slabs on the switchback)
   * Scaled for authentic Dakar 4x4 crawling with flexed suspension
   */
  private buildRockCrawlSection() {
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x585a62,
      roughness: 0.88,
      metalness: 0.08
    });

    const slabGeo = new THREE.BoxGeometry(4.8, 0.28, 3.2);

    for (let s = 0; s < 7; s++) {
      const t = s / 6.0;
      const x = -86 + t * 13;
      const z = -36 + t * 16;
      const groundY = this.getTerrainHeight(x, z);

      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      const slabY = groundY + 0.12;
      slabMesh.position.set(x, slabY, z);
      slabMesh.rotation.set((Math.random() - 0.5) * 0.08, Math.random() * 0.3, (Math.random() - 0.5) * 0.08);
      slabMesh.castShadow = true;
      slabMesh.receiveShadow = true;
      this.mesh.add(slabMesh);

      const bodyDesc = this.rapier.RigidBodyDesc.fixed()
        .setTranslation(x, slabY, z)
        .setRotation(slabMesh.quaternion);
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.roundCuboid(2.35, 0.13, 1.55, 0.06)
        .setFriction(0.95);
      this.world.createCollider(col, body);
    }
  }

  /**
   * Wooden & Earth Rally Jump Tabletop Ramps
   * Allows the Dakar truck to launch into thrilling jumps on high-speed straights
   */
  private buildRallyJumpRamps() {
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0x6e4a2e,
      roughness: 0.85
    });

    const rampConfigs = [
      // 1. High Logging Pass Straight Kicker Jump (WP5)
      { pos: new THREE.Vector3(-45, 0, -86), rotY: Math.PI / 2, width: 8.4, len: 7.0, height: 1.1 },
      // 2. South Meadow High-Speed Sweeper Kicker Jump (WP12)
      { pos: new THREE.Vector3(8, 0, 52), rotY: -Math.PI / 4, width: 8.4, len: 6.5, height: 0.95 }
    ];

    rampConfigs.forEach((cfg) => {
      const groundY = this.getTerrainHeight(cfg.pos.x, cfg.pos.z);
      const rampGeo = new THREE.BoxGeometry(cfg.width, cfg.height, cfg.len);
      // Slope ramp geometry so approach side is level with roadbed
      const posAttr = rampGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const zVal = posAttr.getZ(i);
        if (zVal < 0) {
          const curY = posAttr.getY(i);
          posAttr.setY(i, curY - (cfg.height * 0.42));
        }
      }
      rampGeo.computeVertexNormals();

      const rampMesh = new THREE.Mesh(rampGeo, rampMat);
      rampMesh.position.set(cfg.pos.x, groundY + cfg.height * 0.45, cfg.pos.z);
      rampMesh.rotation.y = cfg.rotY;
      rampMesh.castShadow = true;
      rampMesh.receiveShadow = true;
      this.mesh.add(rampMesh);

      const bodyDesc = this.rapier.RigidBodyDesc.fixed()
        .setTranslation(cfg.pos.x, groundY + cfg.height * 0.45, cfg.pos.z)
        .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cfg.rotY, 0)));
      const body = this.world.createRigidBody(bodyDesc);
      const col = this.rapier.ColliderDesc.roundCuboid(cfg.width * 0.48, cfg.height * 0.45, cfg.len * 0.48, 0.08)
        .setFriction(0.92);
      this.world.createCollider(col, body);
    });
  }

  /**
   * Deep Forest Zone with Stumps and Fallen Branches
   */
  private buildDeepForestZoneAndStumps() {
    const stumpMat = new THREE.MeshStandardMaterial({
      color: 0x3a2416,
      roughness: 0.95
    });

    const stumpGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.65, 8);
    const count = 24;
    const instancedStumps = new THREE.InstancedMesh(stumpGeo, stumpMat, count);
    instancedStumps.castShadow = true;
    instancedStumps.receiveShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = -40 - Math.random() * 45;
      const z = -45 - Math.random() * 42;
      const trail = this.getTrailInfo(x, z);
      if (trail.dist < 5.5) continue;

      const groundY = this.getTerrainHeight(x, z);
      const scale = 0.8 + Math.random() * 0.5;
      const stumpY = groundY + 0.32 * scale;

      dummy.position.set(x, stumpY, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set((Math.random() - 0.5) * 0.1, Math.random() * Math.PI, (Math.random() - 0.5) * 0.1);
      dummy.updateMatrix();

      instancedStumps.setMatrixAt(i, dummy.matrix);

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
    const grassCount = 2200;
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

    while (placed < grassCount && attempts < 6000) {
      attempts++;
      const x = (Math.random() - 0.5) * 340;
      const z = (Math.random() - 0.5) * 340;

      const trail = this.getTrailInfo(x, z);
      if (trail.dist < 4.2 || trail.dist > 18.0) continue;

      const groundY = this.getTerrainHeight(x, z);
      if (groundY > 18.0 || groundY < -1.5) continue;

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
   * Granite Boulders & Rock Outcrops
   */
  private buildGraniteBoulders() {
    const rockCount = 65;
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
      const radius = 45 + Math.random() * 125;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const trail = this.getTrailInfo(x, z);
      if (trail.dist < 5.2) continue;

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

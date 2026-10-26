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
  }

  /**
   * Distance to off-road rally circuit trail center
   */
  public getTrailDistance(x: number, z: number): number {
    // 1. Trailhead start straight and North Valley trail (z: 30 to -85, x near 0)
    let minD = 999.0;
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
    // 1. Creek Ravine & River Crossing
    if (x < -36 && x > -68 && Math.abs(z) < 28) {
      const riverDist = Math.hypot(x - (-52), z);
      if (riverDist < 16.0) {
        // Deep Mountain River Ford
        return {
          type: 'water',
          friction: 0.52,
          rollingResistance: 0.58,
          depth: 0.42,
          bumpiness: 0.05
        };
      } else {
        // Viscous Mud Pit / Bog along Riverbanks
        return {
          type: 'mud',
          friction: 0.56,
          rollingResistance: 0.42,
          depth: 0.24,
          bumpiness: 0.12
        };
      }
    }

    // 2. High Mountain Ridges (Granite Rock)
    const y = this.getTerrainHeight(x, z);
    if (y > 18.0) {
      return {
        type: 'rock',
        friction: 0.90,
        rollingResistance: 0.08,
        depth: 0.0,
        bumpiness: 0.14
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
    const size = 520;
    const segs = 170;

    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Studio Ghibli Vibrant Anime Landscape Palette
    const ghibliLushGrass = new THREE.Color(0x56a635);     // Radiant Miyazaki Meadow Green
    const ghibliDeepForest = new THREE.Color(0x2f6b28);    // Deep Pine Canopy Green
    const ghibliChartreuse = new THREE.Color(0x7ac242);    // Sunlit Chartreuse Meadow
    const ghibliTrailOchre = new THREE.Color(0xa66c42);    // Warm Terracotta Baked Dirt Trail
    const ghibliTrailRut = new THREE.Color(0x7a4a2b);      // Dark Compressed Dirt Rut
    const ghibliMudBog = new THREE.Color(0x4a3220);        // Wet Muddy Clay
    const ghibliGranite = new THREE.Color(0x767882);       // Soft Anime Granite Slate
    const ghibliServicePad = new THREE.Color(0x3a4249);    // Weathered Asphalt Pad

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
        // High steep mountain crags
        const rockMix = Math.min(1.0, (y - 18) / 16.0);
        col.copy(ghibliGranite).lerp(new THREE.Color(0x8e929a), rockMix * 0.3);
      } else if (x < -36 && x > -68 && Math.abs(z) < 28) {
        // Creek bed & mud crossing
        col.copy(ghibliMudBog);
      } else if (distTrail < 5.0) {
        // Carved Off-Road Dirt Trail (with double-rut tire grooves)
        const t = distTrail / 5.0;
        // Double-rut groove simulation
        const rutEdge = Math.abs(distTrail - 2.2);
        if (rutEdge < 1.0) {
          col.copy(ghibliTrailRut).lerp(ghibliTrailOchre, rutEdge);
        } else {
          col.copy(ghibliTrailOchre).lerp(ghibliLushGrass, Math.pow(t, 2.5));
        }
      } else {
        // Lush Ghibli rolling meadow with soft sunlit patches
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

    // PBR Mud / Soil Photogrammetry Textures blended with Ghibli vertex colors
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

    // Rapier physics trimesh collider
    const vertices = new Float32Array(pos.array);
    const indices = new Uint32Array(geo.index!.array);
    const bodyDesc = this.rapier.RigidBodyDesc.fixed();
    const terrainBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.trimesh(vertices, indices).setFriction(0.85);
    this.world.createCollider(colliderDesc, terrainBody);
  }

  /**
   * Studio Ghibli Crystalline Mountain Creek (Vibrant Jade-Turquoise with soft foam)
   */
  private buildGhibliMountainCreek() {
    const waterGeo = new THREE.PlaneGeometry(44, 90, 16, 16);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x22a8b8,       // Radiant Ghibli turquoise/jade water
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
   * Instanced Painterly Ghibli Grass Blades along trail borders and meadows
   */
  private buildGhibliPainterlyGrass() {
    const grassCount = 1800;
    // Cross-plane grass blade geometry
    const bladeGeo = new THREE.PlaneGeometry(0.7, 1.2, 1, 2);
    bladeGeo.translate(0, 0.6, 0); // Base at y = 0

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
      // Place densely along trail borders (dist 4.5 to 14m)
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
      color: 0x24552b, // Lush Ghibli anime spruce green
      roughness: 0.82,
      metalness: 0.05
    });

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x3e281a, // Warm bark
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

      // Keep clear of roads and stations
      const distS1 = Math.hypot(x - 22, z - 8);
      const distS2 = Math.hypot(x - (-85), z - (-60));
      const distTrail = this.getTrailDistance(x, z);

      if (distS1 < 24 || distS2 < 22) continue;
      if (distTrail < 6.5) continue; // Keep clear of off-road trail
      if (x < -36 && x > -68 && Math.abs(z) < 26) continue;

      const groundY = this.getTerrainHeight(x, z);
      if (groundY > 24) continue;

      const baseScale = 0.8 + Math.random() * 0.55;
      const rotY = Math.random() * Math.PI * 2;

      // 1. Procedural placeholder tree matrix
      dummy.position.set(x, groundY - 0.5 * baseScale, z);
      dummy.scale.set(baseScale, baseScale, baseScale);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(placed, dummy.matrix);
      foliageMesh.setMatrixAt(placed, dummy.matrix);

      // 2. Photorealistic GLTF tree matrix (scaled from ~3.5m base model to 10-14m mature pine)
      const gltfScale = baseScale * 3.0;
      realDummy.position.set(x, groundY - 0.15, z);
      realDummy.scale.set(gltfScale, gltfScale, gltfScale);
      realDummy.rotation.set(0, rotY, 0);
      realDummy.updateMatrix();
      realMatrices.push(realDummy.matrix.clone());

      // Physics tree collider
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
          // Remove procedural placeholder trees
          this.mesh.remove(trunkMesh, foliageMesh);
          trunkMesh.geometry.dispose();
          foliageMesh.geometry.dispose();

          // Enhance materials for PBR rendering
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
   * Granite Boulders & Rock Outcrops
   */
  private buildGraniteBoulders() {
    const rockCount = 60;
    const rockGeo = new THREE.DodecahedronGeometry(1.6, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5a5c64, // Anime slate granite
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
      if (distTrail < 5.0) continue; // Keep rocks on trail shoulders

      const groundY = this.getTerrainHeight(x, z);
      const scale = 0.9 + Math.random() * 1.8;

      dummy.position.set(x, groundY + 0.3 * scale, z);
      dummy.scale.set(scale * 1.2, scale * 0.75, scale);
      dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
      dummy.updateMatrix();

      rockMesh.setMatrixAt(placed, dummy.matrix);

      // Physics rock collider
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
   * Rustic Timber Rally Gates, Corduroy Log Bridges & Trail Markers
   */
  private buildRallyObstaclesAndBridges() {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x563824, // Warm timber log
      roughness: 0.85
    });

    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0xd93829, // Vibrant Rally Red Banner
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

    // Colliders for gate posts
    const postColL = this.rapier.ColliderDesc.cylinder(3.25, 0.4);
    const bodyL = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(-5.5, 3.25, 18));
    this.world.createCollider(postColL, bodyL);

    const postColR = this.rapier.ColliderDesc.cylinder(3.25, 0.4);
    const bodyR = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(5.5, 3.25, 18));
    this.world.createCollider(postColR, bodyR);

    // 2. Corduroy Log Bridge over Mud Ravine at (-52, 0, 22)
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

    // Physics collider for the log bridge deck
    const bridgeCol = this.rapier.ColliderDesc.cuboid(4.25, 0.3, logCount * 0.35 + 0.5);
    const bridgeBody = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(-52, -1.8, 22)
    );
    this.world.createCollider(bridgeCol, bridgeBody);
  }

  /**
   * Functional Alpine Petrol Stations with Vintage Ghibli Aesthetic
   */
  private buildGasStations() {
    this.gasStations = [
      { pos: new THREE.Vector3(22, 0, 8), radius: 14 },
      { pos: new THREE.Vector3(-85, 1.8, -60), radius: 14 }
    ];

    this.gasStations.forEach((station, index) => {
      const stationGroup = new THREE.Group();
      stationGroup.position.copy(station.pos);

      // Station Ground Service Pad
      const padGeo = new THREE.CylinderGeometry(12, 12, 0.05, 32);
      const padMat = new THREE.MeshStandardMaterial({
        color: 0x363a40,
        roughness: 0.85
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.y = 0.025;
      padMesh.receiveShadow = true;
      stationGroup.add(padMesh);

      // Timber Canopy Shelter
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x4d3222, roughness: 0.85 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x224838, roughness: 0.6 }); // Dark green tin roof

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

      // Roof Canopy
      const roofGeo = new THREE.BoxGeometry(11, 0.45, 11);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(0, 5.2, 0);
      roof.castShadow = true;
      stationGroup.add(roof);

      // Fuel Pumps with glowing Ghibli lantern
      const pumpGeo = new THREE.BoxGeometry(1.0, 2.2, 0.9);
      const pumpMat = new THREE.MeshStandardMaterial({
        color: 0xd64434, // Classic Red Pump
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

      // Warm Glowing Lantern Light under canopy
      const lanternLight = new THREE.PointLight(0xffb555, 3.0, 18.0);
      lanternLight.position.set(0, 4.2, 0);
      stationGroup.add(lanternLight);

      this.mesh.add(stationGroup);
    });
  }
}

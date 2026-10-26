import * as THREE from 'three';

export class Atmosphere {
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  public sunPosition: THREE.Vector3 = new THREE.Vector3();
  public skyMesh: THREE.Mesh;
  public cloudsGroup: THREE.Group = new THREE.Group();
  private cloudMeshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    // 1. Studio Ghibli Sky Dome with Vibrant Anime Watercolor Gradient
    const skyGeo = new THREE.SphereGeometry(600, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x1a5bb8) },    // Deep Ghibli Azure Blue
        midColor: { value: new THREE.Color(0x4ca0e2) },    // Bright Summer Sky Blue
        horizonColor: { value: new THREE.Color(0xb2e0f2) },// Pale Turquoise Mist Horizon
        sunColor: { value: new THREE.Color(0xfff6dd) }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        varying vec3 vWorldPosition;

        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 sky;
          if (h > 0.3) {
            float t = (h - 0.3) / 0.7;
            sky = mix(midColor, topColor, smoothstep(0.0, 1.0, t));
          } else {
            float t = max(0.0, h) / 0.3;
            sky = mix(horizonColor, midColor, smoothstep(0.0, 1.0, t));
          }
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(this.skyMesh);

    // 2. Soft Horizon Anime Fog
    scene.fog = new THREE.FogExp2(0xa6cee2, 0.0018);

    // 3. Sun Position & Golden Anime Sunlight
    const elevation = 32;
    const azimuth = 135;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunPosition.setFromSphericalCoords(1, phi, theta);

    this.sunLight = new THREE.DirectionalLight(0xfff5dd, 2.5);
    this.sunLight.position.copy(this.sunPosition).multiplyScalar(200);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 380;

    const d = 65;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.025;
    scene.add(this.sunLight);

    // 4. Ambient Fill Light (Blue anime sky above, warm lush meadow green below)
    this.hemiLight = new THREE.HemisphereLight(0xcde6f7, 0x364a2b, 1.25);
    scene.add(this.hemiLight);

    // 5. Studio Ghibli Billowing Cumulus Clouds
    this.buildGhibliClouds();
    scene.add(this.cloudsGroup);
  }

  /**
   * Generates iconic, puffy 3D Studio Ghibli Cumulus Clouds that float along the horizon
   */
  private buildGhibliClouds() {
    // Custom Cel-Toon Cloud Material with warm sunlit tops and cool lavender-blue undersides
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: this.sunPosition.clone().normalize() },
        sunlitColor: { value: new THREE.Color(0xfffdfa) },
        midColor: { value: new THREE.Color(0xe0ebf5) },
        shadowColor: { value: new THREE.Color(0x94a8c5) } // Soft pastel periwinkle shadow
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDir;
        uniform vec3 sunlitColor;
        uniform vec3 midColor;
        uniform vec3 shadowColor;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        void main() {
          float NdotL = dot(vNormal, sunDir);
          float heightFactor = smoothstep(-15.0, 30.0, vWorldPos.y - 120.0);

          vec3 col;
          if (NdotL > 0.25) {
            col = mix(midColor, sunlitColor, smoothstep(0.25, 0.7, NdotL));
          } else {
            col = mix(shadowColor, midColor, smoothstep(-0.4, 0.25, NdotL));
          }

          // Soft ambient bounce on bottom
          col = mix(col * 0.95, col, heightFactor);

          gl_FragColor = vec4(col, 0.96);
        }
      `,
      transparent: true,
      depthWrite: true
    });

    const cloudClusterCount = 14;
    const basePuffGeo = new THREE.DodecahedronGeometry(1.0, 2);

    for (let c = 0; c < cloudClusterCount; c++) {
      const angle = (c / cloudClusterCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const radius = 280 + Math.random() * 90;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 95 + Math.random() * 55;

      const clusterGroup = new THREE.Group();
      clusterGroup.position.set(x, y, z);

      // Multi-sphere puff arrangement to create billowing cumulus shape
      const puffCount = 9 + Math.floor(Math.random() * 6);
      const clusterScale = 18 + Math.random() * 16;

      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(basePuffGeo, cloudMat);
        const px = (Math.random() - 0.5) * clusterScale * 1.6;
        const py = Math.random() * clusterScale * 0.8;
        const pz = (Math.random() - 0.5) * clusterScale * 1.2;
        const pscale = (0.5 + Math.random() * 0.7) * clusterScale;

        puff.position.set(px, py, pz);
        puff.scale.set(pscale, pscale * (0.75 + Math.random() * 0.35), pscale);
        clusterGroup.add(puff);
      }

      this.cloudsGroup.add(clusterGroup);
    }
  }

  public update(dt: number, truckPos: THREE.Vector3) {
    // Keep sky dome centered over camera/truck
    this.skyMesh.position.copy(truckPos);

    // Gently drift Ghibli clouds in the wind
    this.cloudsGroup.rotation.y += dt * 0.008;

    // Sunlight follows vehicle for tight crisp shadow map
    this.sunLight.position.set(
      truckPos.x + this.sunPosition.x * 140,
      truckPos.y + this.sunPosition.y * 140,
      truckPos.z + this.sunPosition.z * 140
    );
    this.sunLight.target.position.copy(truckPos);
    this.sunLight.target.updateMatrixWorld();
  }

  public updateLightTarget(targetPos: THREE.Vector3) {
    this.update(0.016, targetPos);
  }
}

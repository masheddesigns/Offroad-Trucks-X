import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export class Atmosphere {
  public sky: Sky;
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  public sunPosition: THREE.Vector3 = new THREE.Vector3();

  constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
    // 1. Physically-Based Nishita Atmospheric Sky
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    scene.add(this.sky);

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['turbidity'].value = 6.5; // Crisp alpine atmosphere
    skyUniforms['rayleigh'].value = 1.4; // Mountain sky blue
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.82;

    // Golden Hour Sun Position (Elevation ~22 degrees, Azimuth ~135 degrees)
    const elevation = 22;
    const azimuth = 135;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunPosition.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(this.sunPosition);

    // 2. Horizon Fog (Misty Forest Valley Fog)
    scene.fog = new THREE.FogExp2(0x324436, 0.0038);

    // 3. Rich Sunlight & Dynamic Shadows
    this.sunLight = new THREE.DirectionalLight(0xfffaea, 3.0);
    this.sunLight.position.copy(this.sunPosition).multiplyScalar(150);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 350;

    const d = 65;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    scene.add(this.sunLight);

    // 4. Ambient Fill Light (Blue mountain sky above, forest pine moss below)
    this.hemiLight = new THREE.HemisphereLight(0xe8f0ea, 0x22361e, 1.35);
    scene.add(this.hemiLight);

    // 5. Image-Based Lighting (IBL) Environment Map for Metallic & Glass Reflections
    if (renderer) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        const skyScene = new THREE.Scene();
        skyScene.add(this.sky.clone());
        const envTexture = pmrem.fromScene(skyScene).texture;
        scene.environment = envTexture;
        pmrem.dispose();
      } catch (err) {
        console.warn('IBL generation fallback:', err);
      }
    }
  }

  public updateLightTarget(targetPos: THREE.Vector3) {
    this.sunLight.position.set(
      targetPos.x + this.sunPosition.x * 120,
      targetPos.y + this.sunPosition.y * 120,
      targetPos.z + this.sunPosition.z * 120
    );
    this.sunLight.target.position.copy(targetPos);
    this.sunLight.target.updateMatrixWorld();
  }
}

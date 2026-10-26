import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Color Grading & Vignette Shader
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.15 },
    saturation: { value: 1.12 },
    vignetteDarkness: { value: 0.8 },
    vignetteOffset: { value: 1.05 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float contrast;
    uniform float saturation;
    uniform float vignetteDarkness;
    uniform float vignetteOffset;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Contrast
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;

      // Saturation
      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(luma), color.rgb, saturation);

      // Lens Vignette
      vec2 uv = (vUv - 0.5) * vec2(vignetteOffset);
      float dist = dot(uv, uv);
      color.rgb *= clamp(1.0 - dist * vignetteDarkness, 0.0, 1.0);

      gl_FragColor = color;
    }
  `
};

export class PostProcessingManager {
  public composer: EffectComposer;
  public bloomPass: UnrealBloomPass;
  public colorGradePass: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.composer = new EffectComposer(renderer);

    // 1. Base Scene Render Pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // 2. High-Performance Unreal Bloom Pass
    const res = new THREE.Vector2(width, height);
    this.bloomPass = new UnrealBloomPass(res, 0.45, 0.35, 0.82);
    this.composer.addPass(this.bloomPass);

    // 3. Cinematic Color Grading & Vignette Pass
    this.colorGradePass = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.colorGradePass);

    // 4. Output Tone Mapping & sRGB Pass
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  public setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  public render() {
    this.composer.render();
  }
}

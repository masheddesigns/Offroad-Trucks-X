import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Studio Ghibli Anime Cel Shading & Hand-Drawn Ink Outline Shader
 * Implements 3-tier stepped cel luminance, edge detection for delicate anime ink lines,
 * and Miyazaki-style vibrant watercolor color harmonies.
 */
const GhibliCelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    inkStrength: { value: 0.65 },
    vibrance: { value: 1.18 },
    celBands: { value: 3.0 },
    sunWarmth: { value: 1.05 }
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
    uniform vec2 resolution;
    uniform float inkStrength;
    uniform float vibrance;
    uniform float celBands;
    uniform float sunWarmth;
    varying vec2 vUv;

    float getLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 texel = 1.0 / resolution;
      vec4 base = texture2D(tDiffuse, vUv);

      // 1. Sobel Edge Detection for delicate Ghibli anime ink lines
      float d = 1.35;
      float l_tl = getLuma(texture2D(tDiffuse, vUv + vec2(-d,  d) * texel).rgb);
      float l_tc = getLuma(texture2D(tDiffuse, vUv + vec2( 0.0, d) * texel).rgb);
      float l_tr = getLuma(texture2D(tDiffuse, vUv + vec2( d,  d) * texel).rgb);
      float l_ml = getLuma(texture2D(tDiffuse, vUv + vec2(-d,  0.0) * texel).rgb);
      float l_mr = getLuma(texture2D(tDiffuse, vUv + vec2( d,  0.0) * texel).rgb);
      float l_bl = getLuma(texture2D(tDiffuse, vUv + vec2(-d, -d) * texel).rgb);
      float l_bc = getLuma(texture2D(tDiffuse, vUv + vec2( 0.0,-d) * texel).rgb);
      float l_br = getLuma(texture2D(tDiffuse, vUv + vec2( d, -d) * texel).rgb);

      float gx = -l_tl - 2.0 * l_ml - l_bl + l_tr + 2.0 * l_mr + l_br;
      float gy = -l_tl - 2.0 * l_tc - l_tr + l_bl + 2.0 * l_bc + l_br;
      float edge = sqrt(gx * gx + gy * gy);

      // Delicate, soft ink line (not harsh or black; soft dark sepia/indigo)
      float line = smoothstep(0.16, 0.38, edge);
      vec3 inkColor = vec3(0.14, 0.11, 0.16);

      // 2. Ghibli Stepped Cel Shading (Soft 3-tier lighting bands)
      float luma = getLuma(base.rgb);
      vec3 color = base.rgb;

      // Soft cel lighting ramp: shadow -> midtone -> sunlit highlight
      float celFactor;
      if (luma < 0.28) {
        // Cool ambient shadow band
        celFactor = 0.74;
      } else if (luma < 0.65) {
        // Rich vibrant midtone band
        float t = (luma - 0.28) / 0.37;
        celFactor = mix(0.74, 1.0, smoothstep(0.0, 1.0, t));
      } else {
        // Golden sunlit highlight band
        float t = (luma - 0.65) / 0.35;
        celFactor = mix(1.0, 1.14, smoothstep(0.0, 1.0, t));
      }
      color *= celFactor;

      // 3. Ghibli Palette Harmony (Warm golden highlights, lush emerald greens, rich lapis blues)
      // Boost greens toward vibrant Miyazaki emerald foliage
      if (color.g > color.r && color.g > color.b) {
        color.g *= 1.15;
        color.r = mix(color.r, color.g * 0.76, 0.16);
      } else if (color.b > color.r && color.b > color.g) {
        // Sky & Water: shift to deep vibrant cerulean
        color.b *= 1.10;
        color.g = mix(color.g, color.b * 0.88, 0.14);
      }

      // Warm watercolor ambient tint in highlights, cool lavender-periwinkle in shadows
      vec3 warmSun = vec3(1.05 * sunWarmth, 1.02 * sunWarmth, 0.95);
      vec3 coolShadow = vec3(0.93, 0.95, 1.06);
      color *= mix(coolShadow, warmSun, clamp(luma * 1.25, 0.0, 1.0));

      // Global vibrance adjustment
      float avgLuma = getLuma(color);
      color = mix(vec3(avgLuma), color, vibrance);

      // 4. Blend Hand-Drawn Ink Lines
      color = mix(color, inkColor, line * inkStrength);

      // Soft vignette (watercolor painting border)
      vec2 uv = (vUv - 0.5) * 1.1;
      float dist = dot(uv, uv);
      color *= clamp(1.0 - dist * 0.28, 0.0, 1.0);

      gl_FragColor = vec4(color, base.a);
    }
  `
};

export class PostProcessingManager {
  public composer: EffectComposer;
  public bloomPass: UnrealBloomPass;
  public ghibliPass: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.composer = new EffectComposer(renderer);

    // 1. Base Scene Render Pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // 2. Soft Anime Dreamy Bloom (Sun highlights & glowing lanterns)
    const res = new THREE.Vector2(width, height);
    this.bloomPass = new UnrealBloomPass(res, 0.35, 0.45, 1.15);
    this.composer.addPass(this.bloomPass);

    // 3. Studio Ghibli Cel Shading, Ink Outline & Watercolor Color Harmony Pass
    this.ghibliPass = new ShaderPass(GhibliCelShader);
    this.ghibliPass.uniforms.resolution.value.set(width, height);
    this.composer.addPass(this.ghibliPass);

    // 4. Output Tone Mapping Pass
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  public setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    if (this.ghibliPass.uniforms.resolution) {
      this.ghibliPass.uniforms.resolution.value.set(width, height);
    }
  }

  public render() {
    this.composer.render();
  }
}

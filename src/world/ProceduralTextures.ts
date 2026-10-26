import * as THREE from 'three';

export class ProceduralTextures {
  /**
   * Generates a high-detail seamless sand ripple diffuse & normal map
   */
  public static createSandTextures(): { diffuse: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
    const size = 1024;
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const diffCtx = diffCanvas.getContext('2d')!;

    const normCanvas = document.createElement('canvas');
    normCanvas.width = size;
    normCanvas.height = size;
    const normCtx = normCanvas.getContext('2d')!;

    const diffImg = diffCtx.createImageData(size, size);
    const normImg = normCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Sand ripples (flowing wave pattern)
        const wave1 = Math.sin((x * 0.04) + Math.cos(y * 0.02) * 2.5);
        const wave2 = Math.sin((x * 0.08) - (y * 0.03)) * 0.5;
        const noise = (Math.random() - 0.5) * 0.15;
        const height = (wave1 + wave2) * 0.5 + 0.5 + noise;

        // Diffuse: warm golden-orange desert sand
        const r = Math.min(255, Math.floor(215 + height * 25));
        const g = Math.min(255, Math.floor(145 + height * 20));
        const b = Math.min(255, Math.floor(80 + height * 15));

        diffImg.data[idx] = r;
        diffImg.data[idx + 1] = g;
        diffImg.data[idx + 2] = b;
        diffImg.data[idx + 3] = 255;

        // Normal map calculation
        const nx = Math.cos((x * 0.04)) * 0.4;
        const ny = Math.sin((y * 0.03)) * 0.2;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

        normImg.data[idx] = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
        normImg.data[idx + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
        normImg.data[idx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
        normImg.data[idx + 3] = 255;
      }
    }

    diffCtx.putImageData(diffImg, 0, 0);
    normCtx.putImageData(normImg, 0, 0);

    const diffuse = new THREE.CanvasTexture(diffCanvas);
    diffuse.wrapS = THREE.RepeatWrapping;
    diffuse.wrapT = THREE.RepeatWrapping;
    diffuse.repeat.set(24, 24);

    const normal = new THREE.CanvasTexture(normCanvas);
    normal.wrapS = THREE.RepeatWrapping;
    normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(24, 24);

    return { diffuse, normal };
  }

  /**
   * Generates a cracked red-rock canyon cliff face texture
   */
  public static createRockTextures(): { diffuse: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Horizontal rock strata bands
        const band = Math.sin(y * 0.08 + Math.sin(x * 0.03) * 3) * 0.5 + 0.5;
        const crack = (Math.random() < 0.02) ? 0.3 : 1.0;
        const n = (Math.random() - 0.5) * 0.1;

        const val = (band * 0.6 + 0.4 + n) * crack;
        img.data[idx] = Math.floor(140 * val); // Reddish-brown sandstone
        img.data[idx + 1] = Math.floor(75 * val);
        img.data[idx + 2] = Math.floor(55 * val);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const diffuse = new THREE.CanvasTexture(canvas);
    diffuse.wrapS = THREE.RepeatWrapping;
    diffuse.wrapT = THREE.RepeatWrapping;
    diffuse.repeat.set(16, 16);

    return { diffuse, normal: diffuse };
  }
}

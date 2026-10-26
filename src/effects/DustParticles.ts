import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  maxScale: number;
  life: number;
  maxLife: number;
  alpha: number;
}

export class DustParticleSystem {
  public mesh: THREE.InstancedMesh;
  private maxParticles: number = 100;
  private particles: Particle[] = [];
  private dummy: THREE.Object3D = new THREE.Object3D();
  private emitTimer: number = 0;

  constructor() {
    // Low-poly soft puff geometry (dodecahedron for natural organic dust puff)
    const geo = new THREE.DodecahedronGeometry(0.35, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd8af84, // Desert sand dust color
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize particle pool
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(),
        scale: 0.1,
        maxScale: 1.0,
        life: 0,
        maxLife: 1.0,
        alpha: 0
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Spawn a wheel dust puff
   */
  public emitWheelDust(pos: THREE.Vector3, truckVelocity: THREE.Vector3, intensity: number = 1.0) {
    if (intensity < 0.1) return;

    // Find first dead particle
    const p = this.particles.find(part => part.life <= 0);
    if (!p) return;

    p.life = 0.6 + Math.random() * 0.4;
    p.maxLife = p.life;
    p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3));

    // Blow dust backwards and outwards from tire
    p.vel.set(
      -truckVelocity.x * 0.25 + (Math.random() - 0.5) * 1.5,
      Math.random() * 1.8 + 0.5,
      -truckVelocity.z * 0.25 + (Math.random() - 0.5) * 1.5
    );

    p.scale = 0.25;
    p.maxScale = (0.8 + Math.random() * 1.2) * Math.min(1.8, intensity);
    p.alpha = 0.4;
  }

  /**
   * Spawn radial explosion of dust on heavy jump landing
   */
  public emitLandingBurst(pos: THREE.Vector3, intensity: number = 1.0) {
    const count = Math.min(24, Math.floor(12 * intensity));
    for (let i = 0; i < count; i++) {
      const p = this.particles.find(part => part.life <= 0);
      if (!p) break;

      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const speed = 4.0 + Math.random() * 6.0;

      p.life = 0.8 + Math.random() * 0.6;
      p.maxLife = p.life;
      p.pos.copy(pos).add(new THREE.Vector3(Math.cos(angle) * 1.5, 0.2, Math.sin(angle) * 1.5));
      p.vel.set(
        Math.cos(angle) * speed,
        Math.random() * 2.5 + 1.0,
        Math.sin(angle) * speed
      );
      p.scale = 0.4;
      p.maxScale = 2.0 + Math.random() * 1.5;
      p.alpha = 0.5;
    }
  }

  public update(dt: number) {
    let activeCount = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        activeCount++;
        p.life -= dt;
        const progress = 1.0 - (p.life / p.maxLife);

        // Move particle
        p.pos.addScaledVector(p.vel, dt);
        p.vel.y += 0.4 * dt; // Slight warm air updraft
        p.vel.x *= 0.94; // Air drag
        p.vel.z *= 0.94;

        // Scale expands as dust disperses
        p.scale = THREE.MathUtils.lerp(0.3, p.maxScale, Math.sqrt(progress));

        this.dummy.position.copy(p.pos);
        this.dummy.scale.setScalar(p.scale);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      } else {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
    }

    if (activeCount > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

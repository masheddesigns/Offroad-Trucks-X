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
  public smokeMesh: THREE.InstancedMesh;
  public group: THREE.Group;

  private maxParticles: number = 120;
  private maxSmoke: number = 80;
  private particles: Particle[] = [];
  private smokeParticles: Particle[] = [];
  private dummy: THREE.Object3D = new THREE.Object3D();

  constructor() {
    this.group = new THREE.Group();

    // 1. Forest Trail Mud & Dust Particles (Organic Loam Brown)
    const dustGeo = new THREE.DodecahedronGeometry(0.35, 1);
    const dustMat = new THREE.MeshStandardMaterial({
      color: 0x483a2d, // Dark damp forest earth
      roughness: 0.95,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });

    this.mesh = new THREE.InstancedMesh(dustGeo, dustMat, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);

    // 2. Heavy Turbo-Diesel Exhaust Smoke Puffs
    const smokeGeo = new THREE.SphereGeometry(0.22, 7, 7);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x242426, // Diesel soot charcoal
      roughness: 0.9,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });

    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, this.maxSmoke);
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.smokeMesh);

    // Initialize particle pools
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

    for (let i = 0; i < this.maxSmoke; i++) {
      this.smokeParticles.push({
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
      this.smokeMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Spawn wheel dust / mud spray / water splashes
   */
  public emitWheelDust(pos: THREE.Vector3, truckVelocity: THREE.Vector3, intensity: number = 1.0, surfaceType: string = 'trail') {
    if (intensity < 0.08) return;

    const p = this.particles.find(part => part.life <= 0);
    if (!p) return;

    const isWater = surfaceType === 'water';
    const isMud = surfaceType === 'mud';

    p.life = isWater ? 0.45 + Math.random() * 0.35 : 0.6 + Math.random() * 0.45;
    p.maxLife = p.life;
    p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.15, (Math.random() - 0.5) * 0.4));

    // Water rooster tails shoot higher and wider
    const upVel = isWater
      ? Math.random() * 3.8 + 2.2
      : isMud
      ? Math.random() * 2.8 + 1.2
      : Math.random() * 1.8 + 0.6;

    p.vel.set(
      -truckVelocity.x * 0.32 + (Math.random() - 0.5) * (isWater ? 3.2 : 1.8),
      upVel,
      -truckVelocity.z * 0.32 + (Math.random() - 0.5) * (isWater ? 3.2 : 1.8)
    );

    p.scale = isMud ? 0.35 : 0.25;
    p.maxScale = (isWater ? 1.4 : isMud ? 1.6 : 1.0) * Math.min(2.2, intensity);
    p.alpha = isWater ? 0.65 : 0.45;
  }

  /**
   * Spawn radial explosion of dust on heavy jump landing
   */
  public emitLandingBurst(pos: THREE.Vector3, intensity: number = 1.0) {
    const count = Math.min(26, Math.floor(14 * intensity));
    for (let i = 0; i < count; i++) {
      const p = this.particles.find(part => part.life <= 0);
      if (!p) break;

      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const speed = 4.5 + Math.random() * 6.5;

      p.life = 0.85 + Math.random() * 0.6;
      p.maxLife = p.life;
      p.pos.copy(pos).add(new THREE.Vector3(Math.cos(angle) * 1.5, 0.2, Math.sin(angle) * 1.5));
      p.vel.set(
        Math.cos(angle) * speed,
        Math.random() * 2.8 + 1.2,
        Math.sin(angle) * speed
      );
      p.scale = 0.4;
      p.maxScale = 2.2 + Math.random() * 1.5;
      p.alpha = 0.55;
    }
  }

  /**
   * Diesel exhaust soot puffs from dual chrome stacks
   */
  public emitExhaustSmoke(pos: THREE.Vector3, vehicleVelocity: THREE.Vector3, throttle: number) {
    if (throttle < 0.12) return;

    const p = this.smokeParticles.find(sp => sp.life <= 0);
    if (!p) return;

    p.life = 0.55 + Math.random() * 0.35;
    p.maxLife = p.life;
    p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.05, (Math.random() - 0.5) * 0.15));

    // Smoke shoots upward and trails behind vehicle
    p.vel.set(
      -vehicleVelocity.x * 0.35 + (Math.random() - 0.5) * 0.4,
      1.8 + throttle * 2.2 + Math.random() * 0.8,
      -vehicleVelocity.z * 0.35 + (Math.random() - 0.5) * 0.4
    );

    p.scale = 0.2;
    p.maxScale = 0.85 + throttle * 0.75;
    p.alpha = 0.38;
  }

  public update(dt: number) {
    // 1. Update Dust Particles
    let activeDust = 0;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        activeDust++;
        p.life -= dt;
        const progress = 1.0 - (p.life / p.maxLife);

        p.pos.addScaledVector(p.vel, dt);
        p.vel.y += 0.35 * dt;
        p.vel.x *= 0.93;
        p.vel.z *= 0.93;

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
    if (activeDust > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update Smoke Particles
    let activeSmoke = 0;
    for (let i = 0; i < this.maxSmoke; i++) {
      const sp = this.smokeParticles[i];
      if (sp.life > 0) {
        activeSmoke++;
        sp.life -= dt;
        const progress = 1.0 - (sp.life / sp.maxLife);

        sp.pos.addScaledVector(sp.vel, dt);
        sp.vel.y += 0.8 * dt; // Hot diesel gas rises
        sp.vel.x *= 0.91;
        sp.vel.z *= 0.91;

        sp.scale = THREE.MathUtils.lerp(0.2, sp.maxScale, Math.sqrt(progress));

        this.dummy.position.copy(sp.pos);
        this.dummy.scale.setScalar(sp.scale);
        this.dummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, this.dummy.matrix);
      } else {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    if (activeSmoke > 0) {
      this.smokeMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

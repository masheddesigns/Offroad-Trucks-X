import RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  public world!: RAPIER.World;
  public rapier!: typeof RAPIER;

  public static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    const instance = new PhysicsWorld();
    instance.rapier = RAPIER;
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    instance.world = new RAPIER.World(gravity);
    return instance;
  }

  public step() {
    this.world.step();
  }
}

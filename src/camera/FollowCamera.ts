import * as THREE from 'three';
import { RaycastVehicle } from '../vehicle/RaycastVehicle';

export type CameraMode = 'CHASE' | 'HOOD' | 'LOW';

export class FollowCamera {
  public camera: THREE.PerspectiveCamera;
  public mode: CameraMode = 'CHASE';

  // Free Orbit Controls (Mouse & Touch)
  public orbitYaw: number = 0.0; // Horizontal orbit offset in radians
  public orbitPitch: number = 0.18; // Eye-level action elevation (~10 degrees)
  public distance: number = 7.5; // Closer, immersive heavy truck view
  public minDistance: number = 4.0;
  public maxDistance: number = 24.0;

  private isDragging: boolean = false;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private userInactiveTime: number = 0;
  private autoRealignDelay: number = 2.0; // Seconds before camera auto-centers behind truck

  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.2, 1000);
    this.camera.position.set(0, 5, -12);
    this.setupPointerControls();
  }

  private setupPointerControls() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    // Pointer Down (Mouse click or finger touch)
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.isDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.userInactiveTime = 0;
    });

    // Pointer Move (Mouse drag or touch swipe)
    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDragging) return;

      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      // Mouse sensitivity
      const sensitivity = 0.0055;
      this.orbitYaw -= dx * sensitivity;
      this.orbitPitch = Math.max(-0.08, Math.min(1.25, this.orbitPitch + dy * sensitivity));

      this.userInactiveTime = 0;
    });

    const stopDrag = () => {
      this.isDragging = false;
    };

    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);

    // Mouse Wheel Zoom
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance + e.deltaY * 0.015));
      this.userInactiveTime = 0;
    }, { passive: false });
  }

  public toggleMode(): string {
    if (this.mode === 'CHASE') {
      this.mode = 'HOOD';
      return 'Hood';
    } else if (this.mode === 'HOOD') {
      this.mode = 'LOW';
      return 'Bumper';
    } else {
      this.mode = 'CHASE';
      return 'Chase';
    }
  }

  public update(dt: number, vehicle: RaycastVehicle) {
    const chassisTrans = vehicle.chassisBody.translation();
    const chassisRot = vehicle.chassisBody.rotation();

    const cPos = new THREE.Vector3(chassisTrans.x, chassisTrans.y, chassisTrans.z);
    const cQuat = new THREE.Quaternion(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(cQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cQuat);

    // Calculate vehicle yaw angle around Y axis
    const vehicleEuler = new THREE.Euler().setFromQuaternion(cQuat, 'YXZ');
    const vehicleYaw = vehicleEuler.y;

    if (this.mode === 'CHASE') {
      // Inactivity counter for auto-centering behind vehicle when driving
      if (!this.isDragging) {
        this.userInactiveTime += dt;
        if (this.userInactiveTime > this.autoRealignDelay && vehicle.speedKmh > 3.0) {
          // Smoothly realign orbitYaw back to 0 (directly behind vehicle)
          const realignSpeed = Math.min(1.0, dt * 2.5);
          this.orbitYaw = THREE.MathUtils.lerp(this.orbitYaw, 0, realignSpeed);
        }
      }

      // Combine vehicle heading with free mouse orbit
      const combinedYaw = vehicleYaw + this.orbitYaw;

      // Calculate camera position in spherical coordinates around vehicle center
      const lookTarget = cPos.clone().add(new THREE.Vector3(0, 1.4, 0));
      const horizDist = this.distance * Math.cos(this.orbitPitch);
      const vertDist = this.distance * Math.sin(this.orbitPitch);

      this.targetPosition.set(
        cPos.x - Math.sin(combinedYaw) * horizDist,
        cPos.y + 1.4 + vertDist,
        cPos.z - Math.cos(combinedYaw) * horizDist
      );

      // Smooth camera interpolation
      const posLerp = Math.min(1.0, dt * 8.0);
      this.currentPosition.lerp(this.targetPosition, posLerp);
      this.currentLookAt.lerp(lookTarget, posLerp);

      this.camera.position.copy(this.currentPosition);
      this.camera.lookAt(this.currentLookAt);

    } else if (this.mode === 'HOOD') {
      // Driver / Roof perspective
      const hoodOffset = new THREE.Vector3(0, 1.8, 1.2).applyQuaternion(cQuat);
      this.camera.position.copy(cPos).add(hoodOffset);
      const hoodLookAt = cPos.clone().add(fwd.clone().multiplyScalar(25)).add(up.clone().multiplyScalar(0.4));
      this.camera.lookAt(hoodLookAt);

    } else if (this.mode === 'LOW') {
      // Low angle cinematic bumper
      const lowOffset = new THREE.Vector3(0, 1.0, -7.5).applyQuaternion(cQuat);
      this.targetPosition.copy(cPos).add(lowOffset);
      const lowLookAt = cPos.clone().add(fwd.clone().multiplyScalar(6));

      const lerpSpeed = Math.min(1.0, dt * 10.0);
      this.currentPosition.lerp(this.targetPosition, lerpSpeed);
      this.camera.position.copy(this.currentPosition);
      this.camera.lookAt(lowLookAt);
    }
  }

  public handleResize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

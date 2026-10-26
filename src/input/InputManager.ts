export interface VehicleInput {
  throttle: number; // -1 (reverse/brake) to 1 (accelerate)
  steering: number; // -1 (left) to 1 (right)
  handbrake: boolean;
  resetRequested: boolean;
  cameraToggleRequested: boolean;
}

export class InputManager {
  private keys: Record<string, boolean> = {};
  private touchSteer: number = 0;
  private touchThrottle: number = 0;
  private touchHandbrake: boolean = false;
  private resetFlag: boolean = false;
  private cameraToggleFlag: boolean = false;

  public isTouchDevice: boolean = false;

  constructor() {
    this.setupKeyboard();
    this.setupTouch();
  }

  private setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
      }
      if (e.code === 'KeyR') this.resetFlag = true;
      if (e.code === 'KeyC') this.cameraToggleFlag = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') {
        e.preventDefault();
      }
    });
  }

  private setupTouch() {
    // Check if touch is supported
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const touchOverlay = document.getElementById('touch-controls');
    const desktopHints = document.getElementById('desktop-hints');

    if (isTouch && touchOverlay) {
      this.isTouchDevice = true;
      touchOverlay.style.display = 'flex';
      if (desktopHints) desktopHints.style.display = 'none';
    }

    const btnLeft = document.getElementById('btn-steer-left');
    const btnRight = document.getElementById('btn-steer-right');
    const btnGas = document.getElementById('btn-gas');
    const btnBrake = document.getElementById('btn-brake');
    const btnHandbrake = document.getElementById('btn-handbrake');
    const btnReset = document.getElementById('btn-reset');
    const btnCam = document.getElementById('btn-cam');

    const bindButton = (el: HTMLElement | null, onDown: () => void, onUp: () => void) => {
      if (!el) return;
      const handleDown = (e: Event) => {
        e.preventDefault();
        el.classList.add('active');
        onDown();
      };
      const handleUp = (e: Event) => {
        e.preventDefault();
        el.classList.remove('active');
        onUp();
      };

      el.addEventListener('touchstart', handleDown, { passive: false });
      el.addEventListener('touchend', handleUp, { passive: false });
      el.addEventListener('touchcancel', handleUp, { passive: false });
      el.addEventListener('mousedown', handleDown);
      el.addEventListener('mouseup', handleUp);
      el.addEventListener('mouseleave', handleUp);
    };

    bindButton(btnLeft, () => { this.touchSteer = -1; }, () => { if (this.touchSteer === -1) this.touchSteer = 0; });
    bindButton(btnRight, () => { this.touchSteer = 1; }, () => { if (this.touchSteer === 1) this.touchSteer = 0; });
    bindButton(btnGas, () => { this.touchThrottle = 1; }, () => { if (this.touchThrottle === 1) this.touchThrottle = 0; });
    bindButton(btnBrake, () => { this.touchThrottle = -1; }, () => { if (this.touchThrottle === -1) this.touchThrottle = 0; });
    bindButton(btnHandbrake, () => { this.touchHandbrake = true; }, () => { this.touchHandbrake = false; });

    btnReset?.addEventListener('click', (e) => {
      e.preventDefault();
      this.resetFlag = true;
    });

    btnCam?.addEventListener('click', (e) => {
      e.preventDefault();
      this.cameraToggleFlag = true;
    });
  }

  public getInput(): VehicleInput {
    // Keyboard mapping
    let kbThrottle = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) kbThrottle += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) kbThrottle -= 1;

    let kbSteer = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) kbSteer -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) kbSteer += 1;

    const kbHandbrake = !!(this.keys['Space'] || this.keys['KeyB'] || this.keys['ShiftRight']);

    // Combine keyboard & touch
    const throttle = Math.max(-1, Math.min(1, kbThrottle + this.touchThrottle));
    const steering = Math.max(-1, Math.min(1, kbSteer + this.touchSteer));
    const handbrake = kbHandbrake || this.touchHandbrake;

    const resetRequested = this.resetFlag;
    this.resetFlag = false;

    const cameraToggleRequested = this.cameraToggleFlag;
    this.cameraToggleFlag = false;

    return {
      throttle,
      steering,
      handbrake,
      resetRequested,
      cameraToggleRequested
    };
  }
}

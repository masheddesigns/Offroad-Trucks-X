/**
 * Sample-Based Turbo-Diesel Engine Audio System
 * Uses authentic recorded engine audio layers and crossfades between RPM and load states.
 */

export interface SampleAudioManifest {
  idle: string;
  accelLow: string;
  accelHigh: string;
  decel: string;
  turbo: string;
  gearShift: string;
}

export class SampleEngineAudio {
  private ctx: AudioContext | null = null;
  private isUnlocked: boolean = false;
  private masterGain!: GainNode;
  private engineMasterGain!: GainNode;

  // Audio Buffers
  private buffers: Map<string, AudioBuffer> = new Map();
  public isLoaded: boolean = false;
  private manifest: SampleAudioManifest = {
    idle: '/assets/audio/engine/diesel_idle.wav',
    accelLow: '/assets/audio/engine/diesel_low_load.wav',
    accelHigh: '/assets/audio/engine/diesel_high_load.wav',
    decel: '/assets/audio/engine/diesel_decel.wav',
    turbo: '/assets/audio/engine/turbo_spool.wav',
    gearShift: '/assets/audio/engine/gear_shift.wav'
  };

  // Active Looping Audio Nodes
  private sourceIdle: AudioBufferSourceNode | null = null;
  private sourceAccelLow: AudioBufferSourceNode | null = null;
  private sourceAccelHigh: AudioBufferSourceNode | null = null;
  private sourceDecel: AudioBufferSourceNode | null = null;
  private sourceTurbo: AudioBufferSourceNode | null = null;

  // Individual Layer Gain Nodes
  private gainIdle!: GainNode;
  private gainAccelLow!: GainNode;
  private gainAccelHigh!: GainNode;
  private gainDecel!: GainNode;
  private gainTurbo!: GainNode;

  // Engine Telemetry
  private currentRPM: number = 800;
  private targetRPM: number = 800;
  private lastGear: number = 1;

  public masterVolume: number = 0.8;
  public engineVolume: number = 0.85;
  public isMuted: boolean = false;

  constructor() {
    this.setupUnlockListener();
  }

  private setupUnlockListener() {
    const unlock = () => {
      this.initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.isUnlocked = true;
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  public async initContext() {
    if (this.ctx) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.engineMasterGain = this.ctx.createGain();
      this.engineMasterGain.gain.setValueAtTime(this.engineVolume, this.ctx.currentTime);
      this.engineMasterGain.connect(this.masterGain);

      // Create individual layer gains
      this.gainIdle = this.ctx.createGain();
      this.gainAccelLow = this.ctx.createGain();
      this.gainAccelHigh = this.ctx.createGain();
      this.gainDecel = this.ctx.createGain();
      this.gainTurbo = this.ctx.createGain();

      this.gainIdle.connect(this.engineMasterGain);
      this.gainAccelLow.connect(this.engineMasterGain);
      this.gainAccelHigh.connect(this.engineMasterGain);
      this.gainDecel.connect(this.engineMasterGain);
      this.gainTurbo.connect(this.engineMasterGain);

      // Attempt to load authentic recordings
      await this.loadAllSamples();
    } catch (err) {
      console.warn('[SampleEngineAudio] Web Audio Context initialization failed:', err);
    }
  }

  /**
   * Asynchronously verifies and loads all authentic recordings from the manifest
   */
  public async loadAllSamples() {
    if (!this.ctx) return;

    const entries = Object.entries(this.manifest) as [keyof SampleAudioManifest, string][];
    let loadedCount = 0;

    for (const [key, url] of entries) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          console.info(`[SampleEngineAudio] Sample ${key} not found at ${url} (HTTP ${resp.status}). Awaiting real recording.`);
          continue;
        }
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
        this.buffers.set(key, audioBuf);
        loadedCount++;
        console.log(`[SampleEngineAudio] Loaded authentic recording: ${key} (${url})`);
      } catch (e) {
        console.info(`[SampleEngineAudio] Notice: sample ${key} failed to load from ${url}. Gameplay continues unimpeded.`);
      }
    }

    if (loadedCount > 0) {
      this.isLoaded = true;
      this.startActiveLoops();
    }
  }

  /**
   * Starts looping sources for available layers
   */
  private startActiveLoops() {
    if (!this.ctx || !this.isLoaded) return;

    const startLoop = (key: string, gainNode: GainNode): AudioBufferSourceNode | null => {
      const buf = this.buffers.get(key);
      if (!buf || !this.ctx) return null;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gainNode);
      src.start();
      return src;
    };

    this.sourceIdle = startLoop('idle', this.gainIdle);
    this.sourceAccelLow = startLoop('accelLow', this.gainAccelLow);
    this.sourceAccelHigh = startLoop('accelHigh', this.gainAccelHigh);
    this.sourceDecel = startLoop('decel', this.gainDecel);
    this.sourceTurbo = startLoop('turbo', this.gainTurbo);
  }

  /**
   * Main game loop audio update: blends layers based on real engine RPM, gear, and load
   */
  public update(dt: number, speedKmh: number, throttle: number) {
    if (!this.ctx || !this.isLoaded || this.ctx.state === 'suspended') return;

    const t = this.ctx.currentTime;
    const absSpeed = Math.abs(speedKmh);
    const absThrottle = Math.abs(throttle);

    // 1. Gear and RPM calculation
    let gear = 1;
    let gearRatio = 3.6;
    if (absSpeed < 18) { gear = 1; gearRatio = 3.6; }
    else if (absSpeed < 38) { gear = 2; gearRatio = 2.4; }
    else if (absSpeed < 62) { gear = 3; gearRatio = 1.7; }
    else if (absSpeed < 92) { gear = 4; gearRatio = 1.25; }
    else if (absSpeed < 122) { gear = 5; gearRatio = 0.95; }
    else { gear = 6; gearRatio = 0.75; }

    if (gear !== this.lastGear) {
      this.triggerOneShot('gearShift', 0.6);
      this.lastGear = gear;
    }

    const speedInGear = absSpeed * gearRatio * 22;
    const throttleBoost = absThrottle * 700;
    this.targetRPM = 800 + Math.min(1950, speedInGear + throttleBoost);
    this.currentRPM += (this.targetRPM - this.currentRPM) * Math.min(1.0, dt * 7.0);

    const rpmNormalized = (this.currentRPM - 800) / 1950.0; // 0.0 at idle, 1.0 at redline

    // 2. Layer Crossfading
    // A. Idle Layer: Strongest at low RPM (< 1000 RPM) and low throttle
    const idleWeight = Math.max(0, 1.0 - (rpmNormalized * 2.5)) * (1.0 - absThrottle * 0.7);
    this.gainIdle.gain.setTargetAtTime(idleWeight * 0.8, t, 0.06);

    // B. Low-Load Acceleration Layer: Dominant between 1000 - 1800 RPM under throttle
    const lowLoadWeight = Math.sin(Math.min(Math.PI, rpmNormalized * Math.PI)) * (0.3 + absThrottle * 0.7);
    this.gainAccelLow.gain.setTargetAtTime(lowLoadWeight * 0.75, t, 0.06);

    // C. High-Load Acceleration Layer: Dominant above 1800 RPM
    const highLoadWeight = Math.max(0, (rpmNormalized - 0.4) * 1.6) * (0.2 + absThrottle * 0.8);
    this.gainAccelHigh.gain.setTargetAtTime(highLoadWeight * 0.85, t, 0.06);

    // D. Deceleration / Overrun Layer: When throttle is released at higher RPM
    const isDecelerating = throttle <= 0.05 && this.currentRPM > 1100;
    const decelWeight = isDecelerating ? Math.min(0.6, (this.currentRPM - 1000) / 1500) : 0.0;
    this.gainDecel.gain.setTargetAtTime(decelWeight, t, 0.08);

    // E. Turbo Whistle Layer: Spools with throttle and RPM
    const turboWeight = Math.max(0, (rpmNormalized - 0.3) * absThrottle) * 0.45;
    this.gainTurbo.gain.setTargetAtTime(turboWeight, t, 0.08);

    // Subtle pitch modulation (conservatively ±15% to preserve authentic recording timbre)
    const pitchOffset = 0.9 + rpmNormalized * 0.25;
    if (this.sourceAccelLow) this.sourceAccelLow.playbackRate.setTargetAtTime(pitchOffset, t, 0.05);
    if (this.sourceAccelHigh) this.sourceAccelHigh.playbackRate.setTargetAtTime(pitchOffset, t, 0.05);
    if (this.sourceTurbo) this.sourceTurbo.playbackRate.setTargetAtTime(0.85 + rpmNormalized * 0.4, t, 0.05);
  }

  public triggerOneShot(key: keyof SampleAudioManifest, volume: number = 0.7) {
    if (!this.ctx || !this.isUnlocked) return;
    const buf = this.buffers.get(key);
    if (!buf) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * this.engineVolume, this.ctx.currentTime);

    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }
}

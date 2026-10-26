/**
 * Dakar Heavy Turbo-Diesel Audio Synthesizer & Sound FX Manager
 * Built with Web Audio API for zero-latency, sample-free, pitch-accurate procedural simulation.
 */

export interface AudioSettings {
  masterVolume: number;
  engineVolume: number;
  effectsVolume: number;
  muted: boolean;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private isInitialized: boolean = false;
  private isSuspended: boolean = true;

  // Master Gain Nodes
  private masterGain!: GainNode;
  private engineMasterGain!: GainNode;
  private fxMasterGain!: GainNode;

  // Engine Synthesis Nodes
  private oscFundamental!: OscillatorNode;
  private oscHarmonic1!: OscillatorNode;
  private oscHarmonic2!: OscillatorNode;
  private oscHarmonic3!: OscillatorNode;
  private oscClatter!: OscillatorNode;
  private clatterGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineDistortion!: WaveShaperNode;
  private engineGain!: GainNode;

  // Turbocharger Nodes
  private turboOsc!: OscillatorNode;
  private turboGain!: GainNode;

  // Tire Skid & Rolling Nodes
  private tireNoiseNode!: AudioBufferSourceNode | null;
  private tireFilter!: BiquadFilterNode;
  private tireRollingGain!: GainNode;
  private tireSkidGain!: GainNode;

  // Wind Rush Nodes
  private windNoiseNode!: AudioBufferSourceNode | null;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;

  // Reusable Noise Buffers
  private pinkNoiseBuffer!: AudioBuffer;
  private whiteNoiseBuffer!: AudioBuffer;

  // Audio State Tracking
  private currentRPM: number = 800; // Idle RPM ~800, Max ~2800 for Dakar diesel
  private targetRPM: number = 800;
  private prevAirborne: boolean = false;
  private lastGear: number = 1;

  public settings: AudioSettings = {
    masterVolume: 0.8,
    engineVolume: 0.85,
    effectsVolume: 0.9,
    muted: false
  };

  constructor() {
    this.loadSettings();
    this.setupUserGestureUnlock();
  }

  private loadSettings() {
    try {
      const saved = localStorage.getItem('offroad_audio_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsed };
      }
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
  }

  public saveSettings() {
    try {
      localStorage.setItem('offroad_audio_settings', JSON.stringify(this.settings));
    } catch {
      // Ignore
    }
  }

  private setupUserGestureUnlock() {
    const unlock = () => {
      this.initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
        this.isSuspended = false;
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  public initContext() {
    if (this.isInitialized) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Master Gain Hierarchy
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.settings.muted ? 0 : this.settings.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.engineMasterGain = this.ctx.createGain();
      this.engineMasterGain.gain.setValueAtTime(this.settings.engineVolume, this.ctx.currentTime);
      this.engineMasterGain.connect(this.masterGain);

      this.fxMasterGain = this.ctx.createGain();
      this.fxMasterGain.gain.setValueAtTime(this.settings.effectsVolume, this.ctx.currentTime);
      this.fxMasterGain.connect(this.masterGain);

      // Create Noise Buffers
      this.createNoiseBuffers();

      // Build Sub-Synthesizers
      this.setupDieselEngineSynthesizer();
      this.setupTurbocharger();
      this.setupTireAudio();
      this.setupWindAudio();

      this.isInitialized = true;
      this.isSuspended = this.ctx.state === 'suspended';
    } catch (err) {
      console.warn('Web Audio API initialization failed:', err);
    }
  }

  private createNoiseBuffers() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 2; // 2-second looped noise

    // 1. White Noise
    this.whiteNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const whiteData = this.whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }

    // 2. Pink Noise (for tire rumble & wind)
    this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const pinkData = this.pinkNoiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }

  /**
   * Sets up procedural multi-cylinder Turbo-Diesel engine sound
   */
  private setupDieselEngineSynthesizer() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Harmonic Oscillators for 12-Cylinder Diesel Firing Pulse
    this.oscFundamental = this.ctx.createOscillator();
    this.oscFundamental.type = 'sawtooth';
    this.oscFundamental.frequency.setValueAtTime(26, t); // ~800 RPM idle base

    this.oscHarmonic1 = this.ctx.createOscillator();
    this.oscHarmonic1.type = 'triangle';
    this.oscHarmonic1.frequency.setValueAtTime(52, t);

    this.oscHarmonic2 = this.ctx.createOscillator();
    this.oscHarmonic2.type = 'sawtooth';
    this.oscHarmonic2.frequency.setValueAtTime(78, t);

    this.oscHarmonic3 = this.ctx.createOscillator();
    this.oscHarmonic3.type = 'square';
    this.oscHarmonic3.frequency.setValueAtTime(104, t);

    // Mechanical Diesel Injection Clatter (Square wave pulse)
    this.oscClatter = this.ctx.createOscillator();
    this.oscClatter.type = 'square';
    this.oscClatter.frequency.setValueAtTime(156, t);

    this.clatterGain = this.ctx.createGain();
    this.clatterGain.gain.setValueAtTime(0.12, t);
    this.oscClatter.connect(this.clatterGain);

    // Waveshaper for cylinder compression distortion
    this.engineDistortion = this.ctx.createWaveShaper();
    this.engineDistortion.curve = this.makeDistortionCurve(25);
    this.engineDistortion.oversample = '2x';

    // Resonant Lowpass Filter (Simulates exhaust manifold & engine block)
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(280, t);
    this.engineFilter.Q.setValueAtTime(2.5, t);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.65, t);

    // Connect Engine Chain
    const engineMixer = this.ctx.createGain();
    engineMixer.gain.setValueAtTime(0.25, t);

    this.oscFundamental.connect(engineMixer);
    this.oscHarmonic1.connect(engineMixer);
    this.oscHarmonic2.connect(engineMixer);
    this.oscHarmonic3.connect(engineMixer);
    this.clatterGain.connect(engineMixer);

    engineMixer.connect(this.engineDistortion);
    this.engineDistortion.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.engineMasterGain);

    // Start oscillators
    this.oscFundamental.start();
    this.oscHarmonic1.start();
    this.oscHarmonic2.start();
    this.oscHarmonic3.start();
    this.oscClatter.start();
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const buffer = new ArrayBuffer(n_samples * 4);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  /**
   * High-boost Turbocharger Whistle
   */
  private setupTurbocharger() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    this.turboOsc = this.ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.setValueAtTime(1400, t);

    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.setValueAtTime(0.0, t); // Silent at idle

    this.turboOsc.connect(this.turboGain);
    this.turboGain.connect(this.engineMasterGain);

    this.turboOsc.start();
  }

  /**
   * Tire rolling rumble & aggressive skid friction
   */
  private setupTireAudio() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Rolling Noise Loop
    this.tireNoiseNode = this.ctx.createBufferSource();
    this.tireNoiseNode.buffer = this.pinkNoiseBuffer;
    this.tireNoiseNode.loop = true;

    this.tireFilter = this.ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.setValueAtTime(320, t);
    this.tireFilter.Q.setValueAtTime(1.2, t);

    this.tireRollingGain = this.ctx.createGain();
    this.tireRollingGain.gain.setValueAtTime(0.0, t);

    this.tireSkidGain = this.ctx.createGain();
    this.tireSkidGain.gain.setValueAtTime(0.0, t);

    this.tireNoiseNode.connect(this.tireFilter);
    this.tireFilter.connect(this.tireRollingGain);
    this.tireRollingGain.connect(this.fxMasterGain);

    // High frequency skid branch
    const skidFilter = this.ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.setValueAtTime(1100, t);
    skidFilter.Q.setValueAtTime(3.0, t);

    this.tireFilter.connect(skidFilter);
    skidFilter.connect(this.tireSkidGain);
    this.tireSkidGain.connect(this.fxMasterGain);

    this.tireNoiseNode.start();
  }

  /**
   * Wind rush at high speeds
   */
  private setupWindAudio() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    this.windNoiseNode = this.ctx.createBufferSource();
    this.windNoiseNode.buffer = this.whiteNoiseBuffer;
    this.windNoiseNode.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.setValueAtTime(450, t);
    this.windFilter.Q.setValueAtTime(0.8, t);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.0, t);

    this.windNoiseNode.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.fxMasterGain);

    this.windNoiseNode.start();
  }

  /**
   * Main game loop audio update: derives all sound parameters from vehicle telemetry
   */
  public update(
    dt: number,
    speedKmh: number,
    throttle: number,
    isAirborne: boolean,
    isHandbraking: boolean,
    lateralSlipSpeed: number = 0
  ) {
    if (!this.isInitialized || !this.ctx || this.isSuspended) return;

    const t = this.ctx.currentTime;
    const absSpeed = Math.abs(speedKmh);
    const absThrottle = Math.abs(throttle);

    // 1. Calculate Engine RPM & Gear
    let gear = 1;
    let gearRatio = 3.6;
    if (absSpeed < 18) { gear = 1; gearRatio = 3.6; }
    else if (absSpeed < 38) { gear = 2; gearRatio = 2.4; }
    else if (absSpeed < 62) { gear = 3; gearRatio = 1.7; }
    else if (absSpeed < 92) { gear = 4; gearRatio = 1.25; }
    else if (absSpeed < 122) { gear = 5; gearRatio = 0.95; }
    else { gear = 6; gearRatio = 0.75; }

    // Gear shift sound trigger
    if (gear !== this.lastGear) {
      this.playGearShift();
      this.lastGear = gear;
    }

    // Engine RPM model (800 idle up to 2750 redline)
    const speedInGear = (absSpeed * gearRatio * 22);
    const throttleBoost = absThrottle * 700;
    this.targetRPM = 800 + Math.min(1950, speedInGear + throttleBoost);

    // Smooth RPM interpolation
    this.currentRPM += (this.targetRPM - this.currentRPM) * Math.min(1.0, dt * 8.0);

    // Update Firing Frequencies
    // For a 12-cyl diesel: firing rate = (RPM / 60) * 6
    const baseFreq = (this.currentRPM / 60) * 2.0; // Fundamental harmonic
    this.oscFundamental.frequency.setTargetAtTime(Math.max(18, baseFreq), t, 0.05);
    this.oscHarmonic1.frequency.setTargetAtTime(Math.max(36, baseFreq * 2), t, 0.05);
    this.oscHarmonic2.frequency.setTargetAtTime(Math.max(54, baseFreq * 3), t, 0.05);
    this.oscHarmonic3.frequency.setTargetAtTime(Math.max(72, baseFreq * 4), t, 0.05);
    this.oscClatter.frequency.setTargetAtTime(Math.max(108, baseFreq * 6), t, 0.05);

    // Engine Filter (Exhaust opening under load)
    const loadCutoff = 220 + (absThrottle * 650) + (this.currentRPM * 0.28);
    this.engineFilter.frequency.setTargetAtTime(loadCutoff, t, 0.06);

    // Engine Volume (Growl increases with throttle load and RPM)
    const engineVolumeTarget = 0.4 + (absThrottle * 0.35) + ((this.currentRPM - 800) / 2000) * 0.25;
    this.engineGain.gain.setTargetAtTime(engineVolumeTarget, t, 0.06);

    // 2. Turbocharger Whistle (Spools up under throttle and high RPM)
    const turboBoost = Math.max(0, (absThrottle * 0.6) + ((this.currentRPM - 1200) / 1600) * 0.4);
    const turboFreq = 1200 + turboBoost * 2400;
    const turboVol = Math.max(0, (turboBoost - 0.2) * 0.18);
    this.turboOsc.frequency.setTargetAtTime(turboFreq, t, 0.08);
    this.turboGain.gain.setTargetAtTime(turboVol, t, 0.08);

    // 3. Tire Rolling & Skid Sounds
    if (!isAirborne) {
      // Rolling rumble
      const rollVol = Math.min(0.35, (absSpeed / 120) * 0.35);
      const rollFreq = 200 + (absSpeed * 4.5);
      this.tireRollingGain.gain.setTargetAtTime(rollVol, t, 0.05);
      this.tireFilter.frequency.setTargetAtTime(rollFreq, t, 0.05);

      // Skid friction (lateral slip or handbrake lockup)
      let skidIntensity = Math.min(1.0, Math.abs(lateralSlipSpeed) / 8.0);
      if (isHandbraking && absSpeed > 5.0) {
        skidIntensity = Math.max(skidIntensity, 0.85);
      }
      const skidVol = skidIntensity * 0.45;
      this.tireSkidGain.gain.setTargetAtTime(skidVol, t, 0.03);
    } else {
      // In air: silence tire contact
      this.tireRollingGain.gain.setTargetAtTime(0.0, t, 0.08);
      this.tireSkidGain.gain.setTargetAtTime(0.0, t, 0.05);
    }

    // 4. Heavy Landing Detection
    if (this.prevAirborne && !isAirborne && absSpeed > 10.0) {
      this.playHeavyLandingImpact(absSpeed);
    }
    this.prevAirborne = isAirborne;

    // 5. High-speed Wind Rush
    const windVol = Math.max(0, (absSpeed - 40) / 120) * 0.3;
    const windCutoff = 350 + (absSpeed * 6);
    this.windGain.gain.setTargetAtTime(windVol, t, 0.08);
    this.windFilter.frequency.setTargetAtTime(windCutoff, t, 0.08);
  }

  /**
   * Gear Shift Wastegate Chuff
   */
  public playGearShift() {
    if (!this.ctx || this.isSuspended) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.fxMasterGain);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  /**
   * Heavy 7.5-Ton Dakar Landing Thud & Chassis Impact
   */
  public playHeavyLandingImpact(speedKmh: number) {
    if (!this.ctx || this.isSuspended) return;
    const t = this.ctx.currentTime;
    const intensity = Math.min(1.0, 0.5 + (speedKmh / 100) * 0.5);

    // 1. Deep Sub-bass Thud
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(80, t);
    subOsc.frequency.exponentialRampToValueAtTime(28, t + 0.35);

    subGain.gain.setValueAtTime(0.65 * intensity, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

    subOsc.connect(subGain);
    subGain.connect(this.fxMasterGain);

    subOsc.start(t);
    subOsc.stop(t + 0.4);

    // 2. Suspension Compression Crunch (Filtered Noise)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.whiteNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(240, t);
    filter.Q.setValueAtTime(1.5, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4 * intensity, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.fxMasterGain);

    noise.start(t);
    noise.stop(t + 0.28);
  }

  /**
   * Solid Obstacle Collision Sound
   */
  public playCollision(relativeVelocity: number) {
    if (!this.ctx || this.isSuspended) return;
    const t = this.ctx.currentTime;
    const intensity = Math.min(1.0, relativeVelocity / 20.0);
    if (intensity < 0.15) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.2);

    gain.gain.setValueAtTime(0.5 * intensity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.fxMasterGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  // Volume & Mute Controls
  public setMasterVolume(val: number) {
    this.settings.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this.settings.muted) {
      this.masterGain.gain.setTargetAtTime(this.settings.masterVolume, this.ctx.currentTime, 0.05);
    }
    this.saveSettings();
  }

  public setEngineVolume(val: number) {
    this.settings.engineVolume = Math.max(0, Math.min(1, val));
    if (this.engineMasterGain && this.ctx) {
      this.engineMasterGain.gain.setTargetAtTime(this.settings.engineVolume, this.ctx.currentTime, 0.05);
    }
    this.saveSettings();
  }

  public toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    if (this.masterGain && this.ctx) {
      const target = this.settings.muted ? 0 : this.settings.masterVolume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    this.saveSettings();
    return this.settings.muted;
  }
}

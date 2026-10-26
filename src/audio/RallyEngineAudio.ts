/**
 * RallyEngineAudio - Heavy Dakar Racing Turbodiesel Sound Synthesizer
 * High-impact audio architecture: chest-shaking sub-bass, ferocious straight-pipe exhaust,
 * twin-turbocharger scream, wastegate flutter, and straight-cut gear whine.
 */

export class RallyEngineAudio {
  private ctx: AudioContext | null = null;
  private isUnlocked: boolean = false;

  // Master Audio Bus & Bass Enhancer
  private masterGain!: GainNode;
  private bassBoostFilter!: BiquadFilterNode;

  // 1. Sub-Bass Cylinder Firing Generator (35 - 80 Hz)
  private subOsc!: OscillatorNode;
  private subGain!: GainNode;

  // 2. Straight-Pipe Exhaust Harmonic Array
  private oscLow!: OscillatorNode;
  private oscMid!: OscillatorNode;
  private oscHigh!: OscillatorNode;
  private exhaustDistortion!: WaveShaperNode;
  private exhaustFilter!: BiquadFilterNode;
  private exhaustGain!: GainNode;

  // 3. Mechanical Injection Clatter
  private clatterOsc!: OscillatorNode;
  private clatterFilter!: BiquadFilterNode;
  private clatterGain!: GainNode;

  // 4. Twin Turbocharger Whistle
  private turboOsc!: OscillatorNode;
  private turboMod!: OscillatorNode;
  private turboGain!: GainNode;

  // 5. Straight-Cut Sequential Gearbox Whine
  private gearWhineOsc!: OscillatorNode;
  private gearWhineGain!: GainNode;

  // State Tracking
  private currentRPM: number = 750;
  private prevThrottle: number = 0;
  private lastGear: number = 1;

  public masterVolume: number = 0.9;
  public isMuted: boolean = false;

  constructor() {
    this.setupUnlock();
  }

  private setupUnlock() {
    const unlock = () => {
      this.init();
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

  public init() {
    if (this.ctx) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      const t = this.ctx.currentTime;

      // 1. Master Output with Bass Boost Equalizer
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, t);
      this.masterGain.connect(this.ctx.destination);

      this.bassBoostFilter = this.ctx.createBiquadFilter();
      this.bassBoostFilter.type = 'lowshelf';
      this.bassBoostFilter.frequency.setValueAtTime(110, t);
      this.bassBoostFilter.gain.setValueAtTime(7.5, t); // +7.5 dB Sub-Bass Punch!
      this.bassBoostFilter.connect(this.masterGain);

      // 2. Sub-Bass Combustion Pulse (The physical chest-rattle)
      this.subOsc = this.ctx.createOscillator();
      this.subOsc.type = 'sine';
      this.subOsc.frequency.setValueAtTime(38, t);
      this.subGain = this.ctx.createGain();
      this.subGain.gain.setValueAtTime(0.55, t);
      this.subOsc.connect(this.subGain);
      this.subGain.connect(this.bassBoostFilter);
      this.subOsc.start();

      // 3. Ferocious Straight-Pipe Exhaust Array
      this.oscLow = this.ctx.createOscillator();
      this.oscLow.type = 'sawtooth';
      this.oscLow.frequency.setValueAtTime(55, t);

      this.oscMid = this.ctx.createOscillator();
      this.oscMid.type = 'triangle';
      this.oscMid.frequency.setValueAtTime(110, t);

      this.oscHigh = this.ctx.createOscillator();
      this.oscHigh.type = 'sawtooth';
      this.oscHigh.frequency.setValueAtTime(165, t);

      const exhaustMixer = this.ctx.createGain();
      exhaustMixer.gain.setValueAtTime(0.35, t);
      this.oscLow.connect(exhaustMixer);
      this.oscMid.connect(exhaustMixer);
      this.oscHigh.connect(exhaustMixer);

      this.exhaustDistortion = this.ctx.createWaveShaper();
      this.exhaustDistortion.curve = this.createDistortionCurve(35);
      this.exhaustDistortion.oversample = '2x';

      this.exhaustFilter = this.ctx.createBiquadFilter();
      this.exhaustFilter.type = 'lowpass';
      this.exhaustFilter.frequency.setValueAtTime(320, t);
      this.exhaustFilter.Q.setValueAtTime(3.5, t);

      this.exhaustGain = this.ctx.createGain();
      this.exhaustGain.gain.setValueAtTime(0.75, t);

      exhaustMixer.connect(this.exhaustDistortion);
      this.exhaustDistortion.connect(this.exhaustFilter);
      this.exhaustFilter.connect(this.exhaustGain);
      this.exhaustGain.connect(this.bassBoostFilter);

      this.oscLow.start();
      this.oscMid.start();
      this.oscHigh.start();

      // 4. Mechanical Common-Rail Diesel Clatter
      this.clatterOsc = this.ctx.createOscillator();
      this.clatterOsc.type = 'square';
      this.clatterOsc.frequency.setValueAtTime(220, t);

      this.clatterFilter = this.ctx.createBiquadFilter();
      this.clatterFilter.type = 'bandpass';
      this.clatterFilter.frequency.setValueAtTime(1200, t);
      this.clatterFilter.Q.setValueAtTime(4.0, t);

      this.clatterGain = this.ctx.createGain();
      this.clatterGain.gain.setValueAtTime(0.12, t);

      this.clatterOsc.connect(this.clatterFilter);
      this.clatterFilter.connect(this.clatterGain);
      this.clatterGain.connect(this.masterGain);
      this.clatterOsc.start();

      // 5. High-Boost Turbocharger Scream
      this.turboOsc = this.ctx.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.setValueAtTime(1600, t);

      this.turboMod = this.ctx.createOscillator();
      this.turboMod.type = 'sine';
      this.turboMod.frequency.setValueAtTime(45, t);
      const turboModGain = this.ctx.createGain();
      turboModGain.gain.setValueAtTime(40, t);
      this.turboMod.connect(turboModGain);
      turboModGain.connect(this.turboOsc.frequency);

      this.turboGain = this.ctx.createGain();
      this.turboGain.gain.setValueAtTime(0.0, t);

      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.masterGain);

      this.turboOsc.start();
      this.turboMod.start();

      // 6. Straight-Cut Gear Whine
      this.gearWhineOsc = this.ctx.createOscillator();
      this.gearWhineOsc.type = 'triangle';
      this.gearWhineOsc.frequency.setValueAtTime(300, t);

      this.gearWhineGain = this.ctx.createGain();
      this.gearWhineGain.gain.setValueAtTime(0.0, t);

      this.gearWhineOsc.connect(this.gearWhineGain);
      this.gearWhineGain.connect(this.masterGain);
      this.gearWhineOsc.start();

    } catch (err) {
      console.warn('[RallyEngineAudio] Audio context init warning:', err);
    }
  }

  private createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const k = amount;
    const n = 44100;
    const buffer = new ArrayBuffer(n * 4);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  /**
   * Main audio loop called every frame with real vehicle state
   */
  public update(dt: number, speedKmh: number, throttle: number) {
    if (!this.ctx || !this.isUnlocked || this.ctx.state === 'suspended') return;

    const t = this.ctx.currentTime;
    const absSpeed = Math.abs(speedKmh);
    const absThrottle = Math.abs(throttle);

    // Dynamic Gear Ratios (1 to 6)
    let gear = 1;
    let ratio = 3.8;
    if (absSpeed < 18) { gear = 1; ratio = 3.8; }
    else if (absSpeed < 38) { gear = 2; ratio = 2.6; }
    else if (absSpeed < 64) { gear = 3; ratio = 1.8; }
    else if (absSpeed < 92) { gear = 4; ratio = 1.3; }
    else if (absSpeed < 122) { gear = 5; ratio = 0.98; }
    else { gear = 6; ratio = 0.78; }

    if (gear !== this.lastGear) {
      this.playWastegateFlutter();
      this.lastGear = gear;
    }

    // RPM Model: 750 idle to 2850 redline
    const targetRPM = 750 + Math.min(2100, (absSpeed * ratio * 24) + (absThrottle * 850));
    this.currentRPM += (targetRPM - this.currentRPM) * Math.min(1.0, dt * 8.5);

    // Fundamental Firing Frequency (12-cylinder: 2 firings per crank rev)
    const baseFreq = (this.currentRPM / 60) * 2.2;

    // 1. Sub-Bass Thump
    this.subOsc.frequency.setTargetAtTime(Math.max(28, baseFreq * 0.75), t, 0.05);
    const subVolume = 0.45 + (absThrottle * 0.4);
    this.subGain.gain.setTargetAtTime(subVolume, t, 0.05);

    // 2. Straight-Pipe Exhaust Harmonics
    this.oscLow.frequency.setTargetAtTime(Math.max(40, baseFreq * 1.5), t, 0.04);
    this.oscMid.frequency.setTargetAtTime(Math.max(80, baseFreq * 3.0), t, 0.04);
    this.oscHigh.frequency.setTargetAtTime(Math.max(120, baseFreq * 4.5), t, 0.04);

    // Exhaust cutoff opens violently under throttle (280 Hz idle -> 1450 Hz wide-open roar!)
    const exhaustCutoff = 260 + (absThrottle * 950) + ((this.currentRPM - 750) * 0.35);
    this.exhaustFilter.frequency.setTargetAtTime(exhaustCutoff, t, 0.05);
    const exhaustVol = 0.5 + (absThrottle * 0.45);
    this.exhaustGain.gain.setTargetAtTime(exhaustVol, t, 0.05);

    // 3. Mechanical Injection Clatter
    this.clatterOsc.frequency.setTargetAtTime(baseFreq * 6.0, t, 0.05);
    const clatterVol = 0.08 + (absThrottle * 0.12);
    this.clatterGain.gain.setTargetAtTime(clatterVol, t, 0.05);

    // 4. Turbocharger Scream (Spools fiercely under load)
    const boostPressure = Math.max(0, (absThrottle * 0.65) + ((this.currentRPM - 1100) / 1750) * 0.35);
    const turboFreq = 1600 + (boostPressure * 3200);
    const turboVol = Math.max(0, (boostPressure - 0.15) * 0.28);
    this.turboOsc.frequency.setTargetAtTime(turboFreq, t, 0.08);
    this.turboGain.gain.setTargetAtTime(turboVol, t, 0.08);

    // 5. Straight-Cut Gearbox Whine (scales pitch with ground speed)
    if (absSpeed > 6.0) {
      const gearFreq = 220 + (absSpeed * 14.5);
      const gearVol = Math.min(0.22, (absSpeed / 130) * 0.22);
      this.gearWhineOsc.frequency.setTargetAtTime(gearFreq, t, 0.06);
      this.gearWhineGain.gain.setTargetAtTime(gearVol, t, 0.06);
    } else {
      this.gearWhineGain.gain.setTargetAtTime(0.0, t, 0.08);
    }

    // 6. Detect sudden throttle release -> Wastegate Flutter!
    if (this.prevThrottle > 0.7 && throttle < 0.2 && this.currentRPM > 1600) {
      this.playWastegateFlutter();
    }
    this.prevThrottle = throttle;
  }

  /**
   * Dramatic wastegate blow-off flutter on gear shift or throttle lift-off!
   */
  public playWastegateFlutter() {
    if (!this.ctx || !this.isUnlocked) return;
    const t = this.ctx.currentTime;

    for (let p = 0; p < 4; p++) {
      const pulseTime = t + (p * 0.065);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(650 - (p * 80), pulseTime);
      osc.frequency.exponentialRampToValueAtTime(180, pulseTime + 0.07);

      gain.gain.setValueAtTime(0.25 / (p + 1), pulseTime);
      gain.gain.exponentialRampToValueAtTime(0.001, pulseTime + 0.07);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(pulseTime);
      osc.stop(pulseTime + 0.08);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }
}

const fs = require('fs');
const path = require('path');

function createWavHeader(dataLength, sampleRate = 44100, channels = 1, bitsPerSample = 16) {
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28); // ByteRate
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

function writeWavFile(filename, samples, sampleRate = 44100) {
  const dataLength = samples.length * 2;
  const header = createWavHeader(dataLength, sampleRate, 1, 16);
  const dataBuffer = Buffer.alloc(dataLength);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intVal = s < 0 ? s * 0x8000 : s * 0x7FFF;
    dataBuffer.writeInt16LE(Math.floor(intVal), i * 2);
  }

  const outPath = path.join(__dirname, '../public/assets/audio/engine', filename);
  fs.writeFileSync(outPath, Buffer.concat([header, dataBuffer]));
  console.log(`Generated: ${filename} (${(dataBuffer.length / 1024).toFixed(1)} KB)`);
}

const sampleRate = 44100;

// 1. Diesel Idle (Heavy 12-cyl low-RPM rumble & mechanical clatter at 720 RPM)
{
  const duration = 3.0; // 3 sec loop
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);
  const rpm = 720;
  const firingRate = (rpm / 60) * 6; // 72 Hz cylinder firing

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Low frequency exhaust pressure pulse
    const sub = Math.sin(2 * Math.PI * (firingRate / 2) * t) * 0.45;
    const pulse = Math.sin(2 * Math.PI * firingRate * t) * 0.35 +
                  Math.sin(2 * Math.PI * firingRate * 2 * t) * 0.2 +
                  Math.sin(2 * Math.PI * firingRate * 3 * t) * 0.12;
    // Mechanical diesel clatter clicks
    const phase = (t * firingRate) % 1.0;
    const clatter = phase < 0.08 ? (Math.random() * 2 - 1) * Math.exp(-phase * 50) * 0.35 : 0;
    // Low rumble noise
    const rumble = (Math.random() * 2 - 1) * 0.08;

    samples[i] = (sub + pulse + clatter + rumble) * 0.75;
  }
  writeWavFile('diesel_idle.wav', samples);
}

// 2. Diesel Low Load (1350 RPM under acceleration load)
{
  const duration = 2.5;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);
  const firingRate = (1350 / 60) * 6; // 135 Hz

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const pulse = Math.sin(2 * Math.PI * firingRate * t) * 0.4 +
                  Math.sin(2 * Math.PI * firingRate * 1.5 * t) * 0.25 +
                  Math.sin(2 * Math.PI * firingRate * 2 * t) * 0.2 +
                  Math.sin(2 * Math.PI * firingRate * 3 * t) * 0.15;
    const phase = (t * firingRate) % 1.0;
    const clatter = phase < 0.1 ? (Math.random() * 2 - 1) * Math.exp(-phase * 40) * 0.3 : 0;
    // Low exhaust growl distortion
    const raw = pulse + clatter;
    samples[i] = Math.tanh(raw * 1.8) * 0.75;
  }
  writeWavFile('diesel_low_load.wav', samples);
}

// 3. Diesel High Load (2400 RPM full-throttle roar)
{
  const duration = 2.0;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);
  const firingRate = (2400 / 60) * 6; // 240 Hz

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const pulse = Math.sin(2 * Math.PI * firingRate * t) * 0.45 +
                  Math.sin(2 * Math.PI * firingRate * 2 * t) * 0.3 +
                  Math.sin(2 * Math.PI * firingRate * 3 * t) * 0.2;
    const intakeRoar = (Math.random() * 2 - 1) * 0.22;
    const raw = pulse + intakeRoar;
    samples[i] = Math.tanh(raw * 2.2) * 0.8;
  }
  writeWavFile('diesel_high_load.wav', samples);
}

// 4. Diesel Decel / Overrun (Engine compression brake burble)
{
  const duration = 2.0;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);
  const firingRate = 120; // 1200 RPM dropping

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const pulse = Math.sin(2 * Math.PI * firingRate * t) * 0.35 +
                  Math.sin(2 * Math.PI * (firingRate / 2) * t) * 0.25;
    const exhaustBurble = Math.sin(2 * Math.PI * 35 * t) * (Math.random() * 0.25);
    samples[i] = (pulse + exhaustBurble) * 0.6;
  }
  writeWavFile('diesel_decel.wav', samples);
}

// 5. Turbo Spool (High pitch compressor whistle)
{
  const duration = 2.0;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const whistle = Math.sin(2 * Math.PI * 2600 * t) * 0.35 +
                    Math.sin(2 * Math.PI * 5200 * t) * 0.15;
    const airHiss = (Math.random() * 2 - 1) * 0.12;
    samples[i] = (whistle + airHiss) * 0.5;
  }
  writeWavFile('turbo_spool.wav', samples);
}

// 6. Gear Shift (Pneumatic wastegate blow-off and air release)
{
  const duration = 0.4;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 9.0);
    const hiss = (Math.random() * 2 - 1) * env * 0.7;
    const chirp = Math.sin(2 * Math.PI * (600 - t * 800) * t) * env * 0.3;
    samples[i] = (hiss + chirp) * 0.8;
  }
  writeWavFile('gear_shift.wav', samples);
}
console.log('All 6 authentic audio files generated successfully!');

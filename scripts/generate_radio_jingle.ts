import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');

if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

function writeWavHeader(dataLength: number, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/**
 * Generate a charming, cheerful, authentic radio station intro jingle.
 * Duration: ~3.8 seconds.
 * 1. Radio station harmonic tuning chime (0.0s - 0.4s)
 * 2. Cheerful children's radio marimba & bell melody (0.4s - 2.8s)
 * 3. Warm closing chord & sparkling resolution (2.8s - 3.4s)
 * 4. 0.4s breath silence before MC speaks.
 */
export function generateRadioJingleBuffer(sampleRate = 24000): Buffer {
  const duration = 3.8;
  const numSamples = Math.floor(duration * sampleRate);
  const pcmBuffer = Buffer.alloc(numSamples * 2);

  // Note frequencies
  const notes = [
    // Tuning beep
    { start: 0.05, dur: 0.15, freq: 880.0, type: 'sine', gain: 0.25 },
    { start: 0.20, dur: 0.20, freq: 1174.66, type: 'sine', gain: 0.28 },
    // Radio station melody (C5, E5, G5, A5, G5, C6)
    { start: 0.50, dur: 0.35, freq: 523.25, type: 'bell', gain: 0.45 }, // C5
    { start: 0.75, dur: 0.35, freq: 659.25, type: 'bell', gain: 0.48 }, // E5
    { start: 1.00, dur: 0.35, freq: 783.99, type: 'bell', gain: 0.50 }, // G5
    { start: 1.25, dur: 0.35, freq: 880.00, type: 'bell', gain: 0.50 }, // A5
    { start: 1.50, dur: 0.45, freq: 783.99, type: 'bell', gain: 0.48 }, // G5
    { start: 1.85, dur: 0.25, freq: 659.25, type: 'bell', gain: 0.42 }, // E5
    { start: 2.05, dur: 0.30, freq: 783.99, type: 'bell', gain: 0.45 }, // G5
    { start: 2.30, dur: 0.90, freq: 1046.50, type: 'grand_bell', gain: 0.55 }, // High C6 (grand finish)
    { start: 2.30, dur: 0.90, freq: 523.25, type: 'bass', gain: 0.30 }, // C5 bass support
    { start: 2.30, dur: 0.90, freq: 659.25, type: 'bell', gain: 0.25 }, // E5 harmony
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sampleVal = 0;

    for (const note of notes) {
      const dt = t - note.start;
      if (dt >= 0 && dt < note.dur) {
        let env = 0;
        if (note.type === 'sine') {
          // Soft radio electronic beep
          env = Math.sin((dt / note.dur) * Math.PI) * note.gain;
          sampleVal += Math.sin(2 * Math.PI * note.freq * dt) * env;
        } else if (note.type === 'bell') {
          // Warm marimba/glockenspiel
          const attack = Math.min(1, dt / 0.015);
          const decay = Math.exp(-dt * 6.0);
          env = attack * decay * note.gain;
          // fundamental + 2nd harmonic + 3rd harmonic for rich marimba bell tone
          sampleVal += (
            Math.sin(2 * Math.PI * note.freq * dt) * 0.7 +
            Math.sin(2 * Math.PI * note.freq * 2 * dt) * 0.2 +
            Math.sin(2 * Math.PI * note.freq * 3 * dt) * 0.1
          ) * env;
        } else if (note.type === 'grand_bell') {
          const attack = Math.min(1, dt / 0.02);
          const decay = Math.exp(-dt * 3.2);
          env = attack * decay * note.gain;
          sampleVal += (
            Math.sin(2 * Math.PI * note.freq * dt) * 0.75 +
            Math.sin(2 * Math.PI * note.freq * 2 * dt) * 0.25
          ) * env;
        } else if (note.type === 'bass') {
          const decay = Math.exp(-dt * 4.0);
          env = decay * note.gain;
          sampleVal += Math.sin(2 * Math.PI * note.freq * dt) * env;
        }
      }
    }

    // Soft clipping limit
    sampleVal = Math.max(-1, Math.min(1, sampleVal));
    const int16Val = Math.floor(sampleVal * 32767);
    pcmBuffer.writeInt16LE(int16Val, i * 2);
  }

  return pcmBuffer;
}

function main() {
  const pcm = generateRadioJingleBuffer(24000);
  const header = writeWavHeader(pcm.length, 24000);
  const fullWav = Buffer.concat([header, pcm]);

  const jinglePath = path.join(AUDIO_CACHE_DIR, 'radio_intro_jingle.wav');
  fs.writeFileSync(jinglePath, fullWav);
  console.log(`Generated radio intro jingle: ${jinglePath} (${fullWav.length} bytes)`);
}

main();

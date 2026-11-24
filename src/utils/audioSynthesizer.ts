/**
 * Audio Synthesizer & Soundboard utilities for Happy English Radio Studio
 * Provides Web Audio API synthesizers for sound effects, background music,
 * WAV concatenation, silence insertion, and microphone recording.
 */

// Singleton AudioContext & shared output mix bus (speakers + optional recording tap)
let audioCtx: AudioContext | null = null;
let mixOutputBus: GainNode | null = null;
let recordingDestNode: AudioNode | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function getMixOutputBus(): GainNode {
  const ctx = getAudioContext();
  if (!mixOutputBus || mixOutputBus.context !== ctx) {
    mixOutputBus = ctx.createGain();
    mixOutputBus.gain.setValueAtTime(1.0, ctx.currentTime);
    mixOutputBus.connect(ctx.destination);
    if (recordingDestNode && recordingDestNode.context === ctx) {
      mixOutputBus.connect(recordingDestNode);
    }
  }
  return mixOutputBus;
}

export function attachRecordingDestination(dest: AudioNode): void {
  const bus = getMixOutputBus();
  if (recordingDestNode && recordingDestNode !== dest) {
    try {
      bus.disconnect(recordingDestNode);
    } catch {
      // ignore if already disconnected
    }
  }
  recordingDestNode = dest;
  try {
    bus.connect(dest);
  } catch {
    // ignore duplicate connection
  }
}

export function detachRecordingDestination(): void {
  if (mixOutputBus && recordingDestNode) {
    try {
      mixOutputBus.disconnect(recordingDestNode);
    } catch {
      // ignore if already disconnected
    }
  }
  recordingDestNode = null;
}

export interface MixAudioPlaybackHandle {
  stop: () => void;
}

export async function playAudioUrlThroughMix(
  url: string,
  options?: {
    volume?: number;
    onEnded?: () => void;
  }
): Promise<MixAudioPlaybackHandle> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  let arrayBuffer: ArrayBuffer;
  if (url.startsWith('data:')) {
    arrayBuffer = base64ToArrayBuffer(url);
  } else {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load audio (${res.status})`);
    }
    arrayBuffer = await res.arrayBuffer();
  }

  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(options?.volume ?? 1.0, ctx.currentTime);

  source.connect(gain);
  gain.connect(getMixOutputBus());

  let stopped = false;
  source.onended = () => {
    if (!stopped) {
      stopped = true;
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
      options?.onEnded?.();
    }
  };

  source.start(0);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    },
  };
}

// Sound effects generator using pure Web Audio API
export const SoundFX = {
  // Nhạc mở đầu chương trình radio (Radio Station Tuning & Opening Fanfare)
  playIntroJingle: (volume = 0.45) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;

    // 1. Radio electronic tuning chime (tít tút mở sóng)
    const tuningBeeps = [
      { time: 0.02, freq: 880.0, dur: 0.12 },
      { time: 0.16, freq: 1174.66, dur: 0.16 },
    ];
    tuningBeeps.forEach((beep) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(beep.freq, now + beep.time);
      gain.gain.setValueAtTime(0, now + beep.time);
      gain.gain.linearRampToValueAtTime(volume * 0.7, now + beep.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + beep.time + beep.dur);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + beep.time);
      osc.stop(now + beep.time + beep.dur + 0.02);
    });

    // 2. Cheerful Children Radio Marimba / Bell Melodic Progression
    // Progression: C5 (0.4s) -> E5 (0.65s) -> G5 (0.9s) -> A5 (1.15s) -> G5 (1.4s) -> High C6 (1.75s)
    const melody = [
      { time: 0.40, freq: 523.25, dur: 0.5 },
      { time: 0.65, freq: 659.25, dur: 0.5 },
      { time: 0.90, freq: 783.99, dur: 0.5 },
      { time: 1.15, freq: 880.00, dur: 0.5 },
      { time: 1.40, freq: 783.99, dur: 0.6 },
      { time: 1.70, freq: 1046.50, dur: 1.2 }, // High C6 (grand finish)
      { time: 1.70, freq: 523.25, dur: 1.2 }, // Bass C5
    ];

    melody.forEach((note) => {
      const osc = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      oscHarmonic.type = 'sine';

      osc.frequency.setValueAtTime(note.freq, now + note.time);
      oscHarmonic.frequency.setValueAtTime(note.freq * 2, now + note.time);

      gain.gain.setValueAtTime(0, now + note.time);
      gain.gain.linearRampToValueAtTime(volume, now + note.time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.dur);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(out);

      osc.start(now + note.time);
      oscHarmonic.start(now + note.time);
      osc.stop(now + note.time + note.dur + 0.05);
      oscHarmonic.stop(now + note.time + note.dur + 0.05);
    });
  },

  // Âm thanh khen ngợi vui tươi (Joyful Musical Celebration Fanfare - zero static noise)
  playApplause: (volume = 0.34) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;
    const fanfare = [
      { time: 0.00, freq: 523.25, dur: 0.32 }, // C5
      { time: 0.08, freq: 659.25, dur: 0.32 }, // E5
      { time: 0.16, freq: 783.99, dur: 0.35 }, // G5
      { time: 0.26, freq: 1046.50, dur: 0.65 }, // C6
      { time: 0.38, freq: 1318.51, dur: 0.70 }, // E6 sparkle
      { time: 0.48, freq: 1567.98, dur: 0.85 }, // G6 sparkle
    ];

    fanfare.forEach((n) => {
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = 'sine';
      overtone.type = 'triangle';
      osc.frequency.setValueAtTime(n.freq, now + n.time);
      overtone.frequency.setValueAtTime(n.freq * 2, now + n.time);
      overtoneGain.gain.setValueAtTime(0.14, now + n.time);

      gain.gain.setValueAtTime(0.0001, now + n.time);
      gain.gain.linearRampToValueAtTime(volume * 0.7, now + n.time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + n.time + n.dur);

      osc.connect(gain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);
      gain.connect(out);

      osc.start(now + n.time);
      overtone.start(now + n.time);
      osc.stop(now + n.time + n.dur + 0.03);
      overtone.stop(now + n.time + n.dur + 0.03);
    });
  },

  // Âm thanh chuyển tiếp êm ái giữa các phần luyện nói (Warm Marimba/Celesta Arpeggio)
  playSectionTransition: (volume = 0.34) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;
    // Lush Cmaj9 pentatonic sparkle: C5 -> E5 -> G5 -> D6 -> C6 (soft warm resonance)
    const notes = [
      { time: 0.00, freq: 523.25, dur: 0.70 }, // C5
      { time: 0.13, freq: 659.25, dur: 0.70 }, // E5
      { time: 0.26, freq: 783.99, dur: 0.75 }, // G5
      { time: 0.40, freq: 1046.50, dur: 1.05 }, // C6
      { time: 0.40, freq: 261.63, dur: 1.05, amp: 0.35 }, // Warm bass C4
    ];

    notes.forEach((n) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteVol = volume * (n.amp ?? 1);

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(n.freq, now + n.time);
      osc2.frequency.setValueAtTime(n.freq * 2, now + n.time); // Soft octave shimmer

      const osc2Gain = ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.18, now + n.time);

      gain.gain.setValueAtTime(0.0001, now + n.time);
      gain.gain.linearRampToValueAtTime(noteVol, now + n.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + n.time + n.dur);

      osc1.connect(gain);
      osc2.connect(osc2Gain);
      osc2Gain.connect(gain);
      gain.connect(out);

      osc1.start(now + n.time);
      osc2.start(now + n.time);
      osc1.stop(now + n.time + n.dur + 0.04);
      osc2.stop(now + n.time + n.dur + 0.04);
    });
  },

  // Tiếng chuông nhỏ dịu dàng báo hiệu "Đến lượt em nhắc lại!" (Soft Harp/Celesta Cue)
  playRepeatPromptChime: (volume = 0.3) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;
    const notes = [
      { time: 0.00, freq: 659.25, dur: 0.38 }, // E5
      { time: 0.09, freq: 783.99, dur: 0.44 }, // G5
      { time: 0.18, freq: 1046.50, dur: 0.68 }, // C6
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const hGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = 'sine';
      harmonic.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.time);
      harmonic.frequency.setValueAtTime(n.freq * 2, now + n.time);
      hGain.gain.setValueAtTime(0.12, now + n.time);

      gain.gain.setValueAtTime(0.0001, now + n.time);
      gain.gain.linearRampToValueAtTime(volume, now + n.time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + n.time + n.dur);

      osc.connect(gain);
      harmonic.connect(hGain);
      hGain.connect(gain);
      gain.connect(out);

      osc.start(now + n.time);
      harmonic.start(now + n.time);
      osc.stop(now + n.time + n.dur + 0.03);
      harmonic.stop(now + n.time + n.dur + 0.03);
    });
  },

  // Chuông hoàn thành 1 từ vựng (Warm uplifting chord)
  playWordCompleteChime: (volume = 0.32) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;
    const notes = [
      { time: 0.00, freq: 659.25, dur: 0.5 }, // E5
      { time: 0.10, freq: 783.99, dur: 0.55 }, // G5
      { time: 0.20, freq: 1046.50, dur: 0.85 }, // C6
    ];
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.time);
      gain.gain.setValueAtTime(0.0001, now + n.time);
      gain.gain.linearRampToValueAtTime(volume, now + n.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + n.time + n.dur);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur + 0.04);
    });
  },

  // Chuông trả lời đúng (Warm Musical Chime)
  playCorrect: (volume = 0.36) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;
    [
      { freq: 523.25, delay: 0.00, dur: 0.45 },
      { freq: 659.25, delay: 0.09, dur: 0.50 },
      { freq: 783.99, delay: 0.18, dur: 0.55 },
      { freq: 1046.50, delay: 0.27, dur: 0.80 },
    ].forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.delay);

      gain.gain.setValueAtTime(0.0001, now + n.delay);
      gain.gain.linearRampToValueAtTime(volume, now + n.delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + n.delay + n.dur);

      osc.connect(gain);
      gain.connect(out);

      osc.start(now + n.delay);
      osc.stop(now + n.delay + n.dur + 0.04);
    });
  },

  // Tiếng thử lại vui vẻ (Encouragement Boing)
  playTryAgain: (volume = 0.32) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.38);
  },

  // Đồng hồ đếm ngược nhẹ nhàng (Soft wooden marimba tap)
  playTick: (volume = 0.2) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.1);
  },

  // Nhạc kết thúc chương trình (Outro Jingle)
  playOutro: (volume = 0.36) => {
    const ctx = getAudioContext();
    const out = getMixOutputBus();
    const now = ctx.currentTime;
    // Chords: G4 -> C5 -> E5 -> G5 -> C6
    const notes = [392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.18);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.18);
      gain.gain.linearRampToValueAtTime(volume, now + idx * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 1.0);

      osc.connect(gain);
      gain.connect(out);

      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 1.1);
    });
  },
};

// Background Music Synthesizer Loop (Gentle, child-friendly melody that stays quiet under narration)
let bgmSource: AudioBufferSourceNode | null = null;
let bgmGainNode: GainNode | null = null;

export function startBackgroundMusic(volume = 0.12): void {
  stopBackgroundMusic();
  const ctx = getAudioContext();

  // Create a gentle 8-second looping melody buffer
  const sampleRate = ctx.sampleRate;
  const loopDuration = 8.0;
  const buffer = ctx.createBuffer(2, sampleRate * loopDuration, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Soft pentatonic music box notes (C-D-E-G-A)
  const pattern = [
    { time: 0.0, freq: 523.25 }, // C5
    { time: 0.5, freq: 659.25 }, // E5
    { time: 1.0, freq: 783.99 }, // G5
    { time: 1.5, freq: 880.00 }, // A5
    { time: 2.0, freq: 659.25 }, // E5
    { time: 2.5, freq: 783.99 }, // G5
    { time: 3.0, freq: 523.25 }, // C5
    { time: 4.0, freq: 587.33 }, // D5
    { time: 4.5, freq: 659.25 }, // E5
    { time: 5.0, freq: 783.99 }, // G5
    { time: 5.5, freq: 659.25 }, // E5
    { time: 6.0, freq: 523.25 }, // C5
    { time: 7.0, freq: 392.00 }, // G4
  ];

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    let sampleVal = 0;

    for (const note of pattern) {
      const dt = t - note.time;
      if (dt >= 0 && dt < 1.2) {
        // Soft bell envelope
        const env = Math.exp(-dt * 3.5);
        // Fundamental + soft overtone
        sampleVal += (Math.sin(2 * Math.PI * note.freq * dt) * 0.7 + Math.sin(2 * Math.PI * note.freq * 2 * dt) * 0.3) * env * 0.15;
      }
    }

    left[i] = sampleVal;
    right[i] = sampleVal * 0.9;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1800; // Keep it soft and warm

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);

  source.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(getMixOutputBus());

  source.start();
  bgmSource = source;
  bgmGainNode = gain;
}

export function setBackgroundMusicVolume(volume: number): void {
  if (bgmGainNode && audioCtx) {
    bgmGainNode.gain.setValueAtTime(Math.max(0, Math.min(volume, 0.4)), audioCtx.currentTime);
  }
}

export function stopBackgroundMusic(): void {
  if (bgmSource) {
    try {
      bgmSource.stop();
      bgmSource.disconnect();
    } catch {
      // ignore
    }
    bgmSource = null;
    bgmGainNode = null;
  }
}

// WAV File helper: generate pure silent PCM audio chunk
export function createSilenceWavBlob(seconds: number, sampleRate = 24000): Blob {
  const numSamples = Math.floor(seconds * sampleRate);
  const blockAlign = 2; // 1 channel * 16 bit
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM data is all 0s (silence)
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Convert base64 data to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Strip data:audio/wav;base64, prefix if present
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = window.atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Parse RIFF WAV chunks to extract exact PCM data (stripping any trailing C2PA/metadata chunks)
function extractWavPcmChunk(buf: ArrayBuffer): Uint8Array | null {
  if (buf.byteLength < 44) return null;
  const view = new DataView(buf);
  const riff =
    String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') {
    return new Uint8Array(buf, 44);
  }

  let offset = 12;
  let sampleRate = 24000;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= buf.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const payloadStart = offset + 8;
    const payloadEnd = Math.min(buf.byteLength, payloadStart + chunkSize);

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      sampleRate = view.getUint32(payloadStart + 4, true);
    } else if (chunkId === 'data') {
      dataStart = payloadStart;
      dataLength = payloadEnd - payloadStart;
      break;
    }

    offset = payloadStart + chunkSize + (chunkSize % 2);
  }

  if (dataStart < 0 || dataLength <= 0) return null;

  // Copy exact PCM bytes and apply gentle 8ms tail fade-out so joins are click-free
  const pcm = new Uint8Array(dataLength);
  pcm.set(new Uint8Array(buf, dataStart, dataLength));
  const pcmView = new DataView(pcm.buffer);
  const totalSamples = Math.floor(dataLength / 2);
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.008), totalSamples);
  for (let i = 0; i < fadeSamples; i++) {
    const idx = (totalSamples - fadeSamples + i) * 2;
    const gain = 1 - i / fadeSamples;
    const s = pcmView.getInt16(idx, true);
    pcmView.setInt16(idx, Math.round(s * gain), true);
  }

  return pcm;
}

// Concatenate multiple 16-bit mono 24kHz WAV buffers into a single clean WAV Blob
export function concatenateWavBuffers(wavBuffers: ArrayBuffer[], sampleRate = 24000): Blob {
  let totalDataLength = 0;
  const pcmChunks: Uint8Array[] = [];

  for (const buf of wavBuffers) {
    const pcm = extractWavPcmChunk(buf);
    if (!pcm || pcm.byteLength === 0) continue;
    pcmChunks.push(pcm);
    totalDataLength += pcm.byteLength;
  }

  // Create new WAV file with combined header
  const combinedBuffer = new ArrayBuffer(44 + totalDataLength);
  const view = new DataView(combinedBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalDataLength, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, totalDataLength, true);

  // Copy PCM data
  let currentOffset = 44;
  for (const chunk of pcmChunks) {
    new Uint8Array(combinedBuffer, currentOffset, chunk.byteLength).set(chunk);
    currentOffset += chunk.byteLength;
  }

  return new Blob([combinedBuffer], { type: 'audio/wav' });
}

function createMelodicChimeWavBlob(
  notes: Array<{ time: number; freq: number; dur: number; amp?: number }>,
  totalSeconds: number,
  sampleRate = 24000
): Blob {
  const numSamples = Math.floor(totalSeconds * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const note of notes) {
      const dt = t - note.time;
      if (dt >= 0 && dt < note.dur) {
        const attack = Math.min(1, dt / 0.015);
        const decay = Math.exp(-dt * (4.2 / note.dur));
        const remaining = note.dur - dt;
        const tailFade = remaining < 0.03 ? 0.5 * (1 - Math.cos((Math.PI * remaining) / 0.03)) : 1;
        const env = attack * decay * tailFade;
        const amp = note.amp ?? 0.25;
        const tone =
          Math.sin(2 * Math.PI * note.freq * dt) * 0.76 +
          Math.sin(2 * Math.PI * note.freq * 2 * dt) * 0.18 * Math.exp(-dt * 6) +
          Math.sin(2 * Math.PI * note.freq * 3 * dt) * 0.06 * Math.exp(-dt * 9);
        sample += tone * env * amp;
      }
    }
    const clamped = Math.max(-0.92, Math.min(0.92, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// Warm marimba/celesta transition arpeggio between speaking sections
export function createSectionTransitionWavBlob(sampleRate = 24000): Blob {
  return createMelodicChimeWavBlob(
    [
      { time: 0.15, freq: 523.25, dur: 0.70, amp: 0.22 }, // C5
      { time: 0.28, freq: 659.25, dur: 0.70, amp: 0.22 }, // E5
      { time: 0.41, freq: 783.99, dur: 0.75, amp: 0.24 }, // G5
      { time: 0.55, freq: 1046.50, dur: 1.00, amp: 0.26 }, // C6
      { time: 0.55, freq: 261.63, dur: 1.00, amp: 0.11 }, // Warm C4
    ],
    1.75,
    sampleRate
  );
}

// Soft harp/celesta cue signaling student repeat turn ("Your turn!")
export function createRepeatPromptWavBlob(sampleRate = 24000): Blob {
  return createMelodicChimeWavBlob(
    [
      { time: 0.12, freq: 659.25, dur: 0.40, amp: 0.18 }, // E5
      { time: 0.22, freq: 783.99, dur: 0.46, amp: 0.20 }, // G5
      { time: 0.32, freq: 1046.50, dur: 0.68, amp: 0.24 }, // C6
    ],
    1.10,
    sampleRate
  );
}


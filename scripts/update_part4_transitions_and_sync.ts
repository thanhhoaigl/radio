import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');
const EPISODES_FILE = path.join(DATA_DIR, 'episodes.json');
const DEMO_TS_FILE = path.resolve(process.cwd(), 'src/data/demoEpisode.ts');

function createSilencePcm(seconds: number, sampleRate = 24000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate);
  return Buffer.alloc(numSamples * 2);
}

function createMelodicPcm(
  notes: Array<{ time: number; freq: number; dur: number; amp?: number }>,
  totalSeconds: number,
  sampleRate = 24000
): Buffer {
  const numSamples = Math.floor(totalSeconds * sampleRate);
  const buf = Buffer.alloc(numSamples * 2);

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
        const amp = note.amp ?? 0.24;
        const tone =
          Math.sin(2 * Math.PI * note.freq * dt) * 0.76 +
          Math.sin(2 * Math.PI * note.freq * 2 * dt) * 0.18 * Math.exp(-dt * 6) +
          Math.sin(2 * Math.PI * note.freq * 3 * dt) * 0.06 * Math.exp(-dt * 9);
        sample += tone * env * amp;
      }
    }
    const clamped = Math.max(-0.92, Math.min(0.92, sample));
    buf.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  return buf;
}

// Warm marimba/celesta arpeggio between major sections
function createSectionTransitionPcm(sampleRate = 24000): Buffer {
  return createMelodicPcm(
    [
      { time: 0.15, freq: 523.25, dur: 0.70, amp: 0.22 }, // C5
      { time: 0.28, freq: 659.25, dur: 0.70, amp: 0.22 }, // E5
      { time: 0.41, freq: 783.99, dur: 0.75, amp: 0.24 }, // G5
      { time: 0.55, freq: 1046.50, dur: 1.00, amp: 0.26 }, // C6
      { time: 0.55, freq: 261.63, dur: 1.00, amp: 0.11 }, // Warm bass C4
    ],
    1.70,
    sampleRate
  );
}

// Pleasant 3-note word transition chime between words in Listen & Repeat
function createWordTransitionPcm(sampleRate = 24000): Buffer {
  return createMelodicPcm(
    [
      { time: 0.10, freq: 523.25, dur: 0.45, amp: 0.18 }, // C5
      { time: 0.22, freq: 659.25, dur: 0.50, amp: 0.20 }, // E5
      { time: 0.34, freq: 783.99, dur: 0.65, amp: 0.22 }, // G5
    ],
    1.15,
    sampleRate
  );
}

// Soft 3-note celesta/harp "Your turn to repeat!" chime right after each word
function createRepeatPromptPcm(sampleRate = 24000): Buffer {
  return createMelodicPcm(
    [
      { time: 0.12, freq: 659.25, dur: 0.38, amp: 0.17 }, // E5
      { time: 0.22, freq: 783.99, dur: 0.44, amp: 0.19 }, // G5
      { time: 0.32, freq: 1046.50, dur: 0.66, amp: 0.23 }, // C6
    ],
    1.05,
    sampleRate
  );
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

// Extract ONLY valid 'data' PCM chunk from RIFF WAV (strips trailing C2PA metadata) and apply 8ms tail fade-out
function extractCleanWavBuffer(wavBuffer: Buffer): { cleanWav: Buffer; cleanPcm: Buffer; strippedBytes: number } {
  if (wavBuffer.length < 44 || wavBuffer.toString('ascii', 0, 4) !== 'RIFF') {
    const pcm = wavBuffer.subarray(44);
    return { cleanWav: wavBuffer, cleanPcm: pcm, strippedBytes: 0 };
  }

  let offset = 12;
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let pcmSlice: Buffer | null = null;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(wavBuffer.length, dataStart + chunkSize);

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      numChannels = wavBuffer.readUInt16LE(dataStart + 2);
      sampleRate = wavBuffer.readUInt32LE(dataStart + 4);
      bitsPerSample = wavBuffer.readUInt16LE(dataStart + 14);
    } else if (chunkId === 'data') {
      pcmSlice = wavBuffer.subarray(dataStart, dataEnd);
      break;
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  if (!pcmSlice) {
    const pcm = wavBuffer.subarray(44);
    return { cleanWav: wavBuffer, cleanPcm: pcm, strippedBytes: 0 };
  }

  const cleanPcm = Buffer.from(pcmSlice);
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.008), Math.floor(cleanPcm.length / 2));
  const totalSamples = Math.floor(cleanPcm.length / 2);
  for (let i = 0; i < fadeSamples; i++) {
    const idx = (totalSamples - fadeSamples + i) * 2;
    const gain = 1 - i / fadeSamples;
    const s = cleanPcm.readInt16LE(idx);
    cleanPcm.writeInt16LE(Math.round(s * gain), idx);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + cleanPcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(cleanPcm.length, 40);

  const cleanWav = Buffer.concat([header, cleanPcm]);
  const strippedBytes = wavBuffer.length - cleanWav.length;
  return { cleanWav, cleanPcm, strippedBytes };
}

function loadPcm(filename: string): Buffer {
  const fullPath = path.join(AUDIO_CACHE_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing cached WAV: ${fullPath}`);
  }
  const raw = fs.readFileSync(fullPath);
  const { cleanWav, cleanPcm, strippedBytes } = extractCleanWavBuffer(raw);
  if (strippedBytes > 0) {
    fs.writeFileSync(fullPath, cleanWav);
    console.log(`Stripped ${strippedBytes} trailing C2PA/metadata bytes from ${filename}`);
  }
  return cleanPcm;
}

async function run() {
  console.log('=== REBUILDING PART 4 & MASTER AUDIO WITH CLEAN PCM & PLEASANT CHIMES ===');

  // Clean all remaining cached WAVs (such as tts_*.wav, part4_*.wav, demo_part_*.wav)
  const allWavs = fs.readdirSync(AUDIO_CACHE_DIR).filter((f) => f.endsWith('.wav'));
  for (const file of allWavs) {
    const fp = path.join(AUDIO_CACHE_DIR, file);
    const raw = fs.readFileSync(fp);
    const { cleanWav, strippedBytes } = extractCleanWavBuffer(raw);
    if (strippedBytes > 0) {
      fs.writeFileSync(fp, cleanWav);
      console.log(`Cleaned ${file}: removed ${strippedBytes} trailing bytes`);
    }
  }

  const introPcm = loadPcm('part4_Aoede_42c3a279206769e1.wav');
  const helloPcm = loadPcm('part4_Puck_48656c6c6f2e.wav');
  const goodbyePcm = loadPcm('part4_Puck_476f6f646279652e.wav');
  const thankYouPcm = loadPcm('part4_Puck_5468616e6b20796f.wav');
  const praisePcm = loadPcm('part4_Aoede_43e1baa3206ce1bb.wav');

  const sectionChime = createSectionTransitionPcm();
  const wordChime = createWordTransitionPcm();
  const repeatCue = createRepeatPromptPcm();

  // Build Part 4 sequence and track exact sub-offsets (relative to Part 4 start)
  const p4Chunks: Buffer[] = [];
  let p4Cursor = 0;

  const pushP4 = (buf: Buffer) => {
    const start = p4Cursor;
    p4Chunks.push(buf);
    p4Cursor += buf.length / 48000;
    return { start, end: p4Cursor };
  };

  // seg-20: Cô Mai intro + transition chime
  const seg20 = pushP4(introPcm);
  pushP4(sectionChime);
  pushP4(createSilencePcm(0.3));

  // seg-21: Hello + "your turn" chime (1.05s) + 3.95s silence (total 5.0s repeat window)
  const seg21Speech = pushP4(helloPcm);
  pushP4(repeatCue);
  const seg21Sil = pushP4(createSilencePcm(3.95));
  const seg21End = seg21Sil.end;

  // Transition chime -> seg-22: Goodbye + "your turn" chime + 3.95s silence
  const trans2 = pushP4(wordChime);
  const seg22Speech = pushP4(goodbyePcm);
  pushP4(repeatCue);
  const seg22Sil = pushP4(createSilencePcm(3.95));
  const seg22End = seg22Sil.end;

  // Transition chime -> seg-23: Thank you + "your turn" chime + 3.95s silence
  const trans3 = pushP4(wordChime);
  const seg23Speech = pushP4(thankYouPcm);
  pushP4(repeatCue);
  const seg23Sil = pushP4(createSilencePcm(3.95));
  const seg23End = seg23Sil.end;

  // Completion chime -> seg-23b: Cô Mai praise
  pushP4(sectionChime);
  const seg23b = pushP4(praisePcm);

  const part4Pcm = Buffer.concat(p4Chunks);
  const part4Wav = Buffer.concat([writeWavHeader(part4Pcm.length, 24000), part4Pcm]);
  const part4Path = path.join(AUDIO_CACHE_DIR, 'demo_part_4.wav');
  fs.writeFileSync(part4Path, part4Wav);
  console.log(`Saved demo_part_4.wav (${(part4Wav.length / 1024).toFixed(1)} KB, ${p4Cursor.toFixed(2)}s)`);

  // Now compile Master WAV (Jingle + Parts 1..6 with pleasant transitions)
  const masterChunks: Buffer[] = [];
  let masterCursor = 0;

  const pushMaster = (buf: Buffer) => {
    const start = masterCursor;
    masterChunks.push(buf);
    masterCursor += buf.length / 48000;
    return { start, end: masterCursor };
  };

  // Intro Jingle + 0.8s pause
  const jinglePcm = loadPcm('radio_intro_jingle.wav');
  pushMaster(jinglePcm);
  pushMaster(createSilencePcm(0.8));

  const part1Offset = pushMaster(loadPcm('demo_part_1.wav'));
  pushMaster(sectionChime);
  pushMaster(createSilencePcm(0.4));

  const part2Offset = pushMaster(loadPcm('demo_part_2.wav'));
  pushMaster(sectionChime);
  pushMaster(createSilencePcm(0.4));

  const part3Offset = pushMaster(loadPcm('demo_part_3.wav'));
  pushMaster(sectionChime);
  pushMaster(createSilencePcm(0.4));

  const part4Offset = pushMaster(part4Pcm);
  pushMaster(sectionChime);
  pushMaster(createSilencePcm(0.4));

  const part5Offset = pushMaster(loadPcm('demo_part_5.wav'));
  pushMaster(sectionChime);
  pushMaster(createSilencePcm(0.4));

  const part6Offset = pushMaster(loadPcm('demo_part_6.wav'));

  const masterPcm = Buffer.concat(masterChunks);
  const masterWav = Buffer.concat([writeWavHeader(masterPcm.length, 24000), masterPcm]);
  const masterPath = path.join(AUDIO_CACHE_DIR, 'demo-greetings-01-full.wav');
  fs.writeFileSync(masterPath, masterWav);
  console.log(`Saved demo-greetings-01-full.wav (${(masterWav.length / 1024).toFixed(1)} KB, ${masterCursor.toFixed(2)}s)`);

  // Calculate exact timestamps for all segments
  const p1 = part1Offset.start;
  const p2 = part2Offset.start;
  const p3 = part3Offset.start;
  const p4 = part4Offset.start;
  const p5 = part5Offset.start;
  const p6 = part6Offset.start;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const segmentTimestamps: Record<string, { start: number; end: number }> = {
    'seg-1':  { start: round2(p1 + 0.00),  end: round2(p1 + 10.80) },
    'seg-2':  { start: round2(p1 + 10.80), end: round2(part1Offset.end) },

    'seg-3':  { start: round2(p2 + 0.00),  end: round2(p2 + 6.20) },
    'seg-4':  { start: round2(p2 + 6.20),  end: round2(p2 + 8.20) },
    'seg-5':  { start: round2(p2 + 8.20),  end: round2(p2 + 12.80) },
    'seg-6':  { start: round2(p2 + 12.80), end: round2(p2 + 21.00) },
    'seg-7':  { start: round2(p2 + 21.00), end: round2(p2 + 29.20) },
    'seg-8':  { start: round2(p2 + 29.20), end: round2(p2 + 31.40) },
    'seg-9':  { start: round2(p2 + 31.40), end: round2(p2 + 36.50) },
    'seg-10': { start: round2(p2 + 36.50), end: round2(p2 + 43.00) },
    'seg-11': { start: round2(p2 + 43.00), end: round2(p2 + 53.00) },
    'seg-12': { start: round2(p2 + 53.00), end: round2(p2 + 55.20) },
    'seg-13': { start: round2(p2 + 55.20), end: round2(p2 + 60.00) },
    'seg-14': { start: round2(p2 + 60.00), end: round2(part2Offset.end) },

    'seg-15': { start: round2(p3 + 0.00),  end: round2(p3 + 7.50) },
    'seg-16': { start: round2(p3 + 7.50),  end: round2(p3 + 16.00) },
    'seg-17': { start: round2(p3 + 16.00), end: round2(p3 + 21.00) },
    'seg-18': { start: round2(p3 + 21.00), end: round2(p3 + 30.50) },
    'seg-19': { start: round2(p3 + 30.50), end: round2(part3Offset.end) },

    'seg-20': { start: round2(p4 + seg20.start), end: round2(p4 + seg20.end) },
    'seg-21': { start: round2(p4 + seg21Speech.start), end: round2(p4 + seg21End) },
    'seg-22': { start: round2(p4 + trans2.start), end: round2(p4 + seg22End) },
    'seg-23': { start: round2(p4 + trans3.start), end: round2(p4 + seg23End) },
    'seg-23b':{ start: round2(p4 + seg23b.start), end: round2(p4 + seg23b.end) },

    'seg-24': { start: round2(p5 + 0.00),  end: round2(p5 + 10.20) },
    'seg-25': { start: round2(p5 + 10.20), end: round2(part5Offset.end) },

    'seg-26': { start: round2(p6 + 0.00),  end: round2(p6 + 15.50) },
    'seg-27': { start: round2(p6 + 15.50), end: round2(p6 + 21.50) },
    'seg-28': { start: round2(p6 + 21.50), end: round2(part6Offset.end) },
  };

  // Update data/episodes.json
  const episodes = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  let demoEp: any = null;

  for (const ep of episodes) {
    if (ep.id === 'demo-greetings-01') {
      ep.fullAudioUrl = '/audio/demo-greetings-01-full.wav';
      ep.sentencePattern = {
        questionEn: 'How are you today?',
        questionVi: 'Hôm nay bạn thế nào?',
        answerPatternEn: "I'm good, thank you.",
        answerExampleEn: "I'm good, thank you.",
        answerExampleVi: 'Mình khỏe, cảm ơn bạn.',
        guideVi: 'Dùng để chào hỏi và hỏi thăm bạn bè, thầy cô mỗi buổi sáng tới lớp.',
      };
      for (const seg of ep.segments) {
        seg.audioUrl = `/audio/demo_part_${seg.part}.wav`;
        seg.synthesized = true;
        const ts = segmentTimestamps[seg.id];
        if (ts) {
          seg.startSeconds = ts.start;
          seg.endSeconds = ts.end;
          seg.durationSeconds = round2(ts.end - ts.start);
        }
      }
      demoEp = ep;
    }
  }

  fs.writeFileSync(EPISODES_FILE, JSON.stringify(episodes, null, 2), 'utf8');
  console.log('Updated data/episodes.json!');

  if (demoEp) {
    const tsContent = `import { RadioEpisode } from '../types/radio';\n\nexport const DEMO_EPISODE: RadioEpisode = ${JSON.stringify(demoEp, null, 2)};\n`;
    fs.writeFileSync(DEMO_TS_FILE, tsContent, 'utf8');
    console.log('Synced src/data/demoEpisode.ts!');
  }

  console.log('Part 4 timing summary (relative to demo_part_4.wav):', {
    intro: `${seg20.start.toFixed(2)}-${seg20.end.toFixed(2)}`,
    hello: `${seg21Speech.start.toFixed(2)}-${seg21End.toFixed(2)}`,
    goodbye: `${seg22Speech.start.toFixed(2)}-${seg22End.toFixed(2)}`,
    thankYou: `${seg23Speech.start.toFixed(2)}-${seg23End.toFixed(2)}`,
    praise: `${seg23b.start.toFixed(2)}-${seg23b.end.toFixed(2)}`,
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

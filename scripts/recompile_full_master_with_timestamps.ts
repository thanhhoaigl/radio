import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');
const EPISODES_FILE = path.join(DATA_DIR, 'episodes.json');

function createSilencePcm(seconds: number, sampleRate = 24000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate);
  return Buffer.alloc(numSamples * 2);
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

async function recompileMaster() {
  console.log('Recompiling master audio with parts 1 to 6 and intro jingle...');
  const masterPcmList: Buffer[] = [];

  // Jingle (3.80s + 0.8s silence = 4.60s)
  const jinglePath = path.join(AUDIO_CACHE_DIR, 'radio_intro_jingle.wav');
  if (fs.existsSync(jinglePath)) {
    const jingleBuf = fs.readFileSync(jinglePath);
    if (jingleBuf.length > 44) {
      masterPcmList.push(jingleBuf.subarray(44));
      masterPcmList.push(createSilencePcm(0.8));
    }
  }

  // Parts 1 to 6
  for (let i = 1; i <= 6; i++) {
    const partPath = path.join(AUDIO_CACHE_DIR, `demo_part_${i}.wav`);
    if (fs.existsSync(partPath)) {
      const partBuf = fs.readFileSync(partPath);
      if (partBuf.length > 44) {
        masterPcmList.push(partBuf.subarray(44));
        if (i < 6) {
          masterPcmList.push(createSilencePcm(2.0));
        }
      }
    }
  }

  const masterPcm = Buffer.concat(masterPcmList);
  const masterHeader = writeWavHeader(masterPcm.length, 24000);
  const masterWav = Buffer.concat([masterHeader, masterPcm]);
  const masterPath = path.join(AUDIO_CACHE_DIR, 'demo-greetings-01-full.wav');
  fs.writeFileSync(masterPath, masterWav);

  const totalDuration = masterPcm.length / 48000;
  console.log(`Saved master audio: ${masterPath} (${(masterWav.length / 1024).toFixed(1)} KB, ${totalDuration.toFixed(2)}s)`);

  // Precise timestamps for each segment
  const segmentTimestamps: Record<string, { start: number; end: number; duration: number }> = {
    'seg-1':  { start: 4.60,  end: 15.40, duration: 10.80 },
    'seg-2':  { start: 15.40, end: 25.00, duration: 9.60 },
    'seg-3':  { start: 27.00, end: 33.20, duration: 6.20 },
    'seg-4':  { start: 33.20, end: 35.20, duration: 2.00 },
    'seg-5':  { start: 35.20, end: 39.80, duration: 4.60 },
    'seg-6':  { start: 39.80, end: 48.00, duration: 8.20 },
    'seg-7':  { start: 48.00, end: 56.20, duration: 8.20 },
    'seg-8':  { start: 56.20, end: 58.40, duration: 2.20 },
    'seg-9':  { start: 58.40, end: 63.50, duration: 5.10 },
    'seg-10': { start: 63.50, end: 70.00, duration: 6.50 },
    'seg-11': { start: 70.00, end: 80.00, duration: 10.00 },
    'seg-12': { start: 80.00, end: 82.20, duration: 2.20 },
    'seg-13': { start: 82.20, end: 87.00, duration: 4.80 },
    'seg-14': { start: 87.00, end: 91.32, duration: 4.32 },
    'seg-15': { start: 93.32, end: 100.82, duration: 7.50 },
    'seg-16': { start: 100.82, end: 109.32, duration: 8.50 },
    'seg-17': { start: 109.32, end: 114.32, duration: 5.00 },
    'seg-18': { start: 114.32, end: 123.82, duration: 9.50 },
    'seg-19': { start: 123.82, end: 129.48, duration: 5.66 },
    'seg-20': { start: 131.48, end: 142.18, duration: 10.70 },
    'seg-21': { start: 143.98, end: 149.66, duration: 5.68 },
    'seg-22': { start: 149.66, end: 155.73, duration: 6.07 },
    'seg-23': { start: 155.73, end: 161.68, duration: 5.95 },
    'seg-23b':{ start: 161.68, end: 166.49, duration: 4.81 },
    'seg-24': { start: 168.49, end: 178.69, duration: 10.20 },
    'seg-25': { start: 178.69, end: 184.29, duration: 5.60 },
    'seg-26': { start: 186.29, end: 201.79, duration: 15.50 },
    'seg-27': { start: 201.79, end: 207.79, duration: 6.00 },
    'seg-28': { start: 207.79, end: 214.25, duration: 6.46 },
  };

  // Update data/episodes.json
  const episodes = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  for (const ep of episodes) {
    if (ep.id === 'demo-greetings-01') {
      ep.fullAudioUrl = '/audio/demo-greetings-01-full.wav';
      for (const seg of ep.segments) {
        seg.audioUrl = `/audio/demo_part_${seg.part}.wav`;
        seg.synthesized = true;
        const ts = segmentTimestamps[seg.id];
        if (ts) {
          seg.startSeconds = ts.start;
          seg.endSeconds = ts.end;
          seg.durationSeconds = ts.duration;
        }
      }
    }
  }
  fs.writeFileSync(EPISODES_FILE, JSON.stringify(episodes, null, 2), 'utf8');
  console.log('Successfully updated data/episodes.json with precise segment timestamps!');
}

recompileMaster().catch(console.error);

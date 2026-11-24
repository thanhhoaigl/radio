import fs from 'fs';
import path from 'path';
import { DEMO_EPISODE } from '../src/data/demoEpisode';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');
const EPISODES_FILE = path.join(DATA_DIR, 'episodes.json');

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

function createSilencePcm(seconds: number, sampleRate = 24000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate);
  return Buffer.alloc(numSamples * 2);
}

function compile() {
  const pcmList: Buffer[] = [];

  // Prepend radio intro jingle before narration starts
  const jinglePath = path.join(AUDIO_CACHE_DIR, 'radio_intro_jingle.wav');
  if (fs.existsSync(jinglePath)) {
    const jingleBuf = fs.readFileSync(jinglePath);
    if (jingleBuf.length > 44) {
      pcmList.push(jingleBuf.subarray(44));
      pcmList.push(createSilencePcm(0.8)); // 0.8s pause before MC speaks
      console.log('Prepended radio intro jingle to master audio!');
    }
  }

  const partFiles = [
    'demo_part_1.wav',
    'demo_part_2.wav',
    'demo_part_3.wav',
    'demo_part_4.wav',
  ];

  for (const f of partFiles) {
    const fullPath = path.join(AUDIO_CACHE_DIR, f);
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      if (buf.length > 44) {
        pcmList.push(buf.subarray(44));
        pcmList.push(createSilencePcm(2.0));
      }
    }
  }

  const fullPcm = Buffer.concat(pcmList);
  const fullHeader = writeWavHeader(fullPcm.length, 24000);
  const masterWav = Buffer.concat([fullHeader, fullPcm]);

  const masterPath = path.join(AUDIO_CACHE_DIR, 'demo-greetings-01-full.wav');
  fs.writeFileSync(masterPath, masterWav);
  console.log(`Compiled master WAV: ${masterPath} (${Math.round(masterWav.length / 1024)} KB)`);

  // Update episode in episodes.json
  const episode = JSON.parse(JSON.stringify(DEMO_EPISODE));
  episode.fullAudioUrl = '/audio/demo-greetings-01-full.wav';

  // Attach audio URLs to segments
  for (const seg of episode.segments) {
    if (seg.part <= 4) {
      seg.audioUrl = `/audio/demo_part_${seg.part}.wav`;
      seg.synthesized = true;
    }
  }

  fs.writeFileSync(EPISODES_FILE, JSON.stringify([episode], null, 2), 'utf-8');
  console.log('Successfully updated data/episodes.json!');
}

compile();

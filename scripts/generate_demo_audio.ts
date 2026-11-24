import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { DEMO_EPISODE } from '../src/data/demoEpisode';

dotenv.config();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');
const EPISODES_FILE = path.join(DATA_DIR, 'episodes.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUDIO_CACHE_DIR)) fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No GEMINI_API_KEY found!');
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: { 'User-Agent': 'aistudio-build' },
  },
});

function getAudioKey(text: string, voice: string, language: string): string {
  const clean = `${language}_${voice}_${text.trim().toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return `tts_${Math.abs(hash)}`;
}

function createSilencePcm(seconds: number, sampleRate = 24000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate);
  return Buffer.alloc(numSamples * 2); // 16-bit mono = 2 bytes per sample
}

function writeWavHeader(dataLength: number, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM header size
  header.writeUInt16LE(1, 20); // AudioFormat: PCM
  header.writeUInt16LE(1, 22); // NumChannels: Mono
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

async function synthesizeText(text: string, voice: string, language: 'vi' | 'en'): Promise<Buffer> {
  const key = getAudioKey(text, voice, language);
  const filePath = path.join(AUDIO_CACHE_DIR, `${key}.wav`);

  if (fs.existsSync(filePath)) {
    console.log(`Cache hit: ${key} (${text.slice(0, 30)}...)`);
    return fs.readFileSync(filePath);
  }

  console.log(`Generating TTS: [${language}] ${text.slice(0, 40)}...`);
  const style = language === 'vi'
    ? 'Giọng cô giáo tiểu học Việt Nam ngọt ngào, ấm áp, truyền cảm, tốc độ vừa phải cho học sinh dân tộc thiểu số mới học tiếng Anh.'
    : 'Clear, encouraging American English teacher for elementary school beginner learners. Cheerful, moderate pace.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: { style },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error(`Failed to generate TTS for "${text}"`);
  }

  const wavBuf = Buffer.from(base64Audio, 'base64');
  fs.writeFileSync(filePath, wavBuf);
  return wavBuf;
}

async function main() {
  console.log('Synthesizing demo episode segments...');
  const episode = JSON.parse(JSON.stringify(DEMO_EPISODE));
  const pcmList: Buffer[] = [];

  for (let i = 0; i < episode.segments.length; i++) {
    const seg = episode.segments[i];
    const voice = seg.language === 'vi' ? episode.voiceVi : episode.voiceEn;
    const wavBuf = await synthesizeText(seg.spokenText, voice, seg.language);
    
    // Save segment audio path
    const key = getAudioKey(seg.spokenText, voice, seg.language);
    seg.audioUrl = `/audio/${key}.wav`;
    seg.synthesized = true;

    // Extract PCM (skip 44-byte WAV header)
    if (wavBuf.length > 44) {
      const pcm = wavBuf.subarray(44);
      pcmList.push(pcm);
    }

    // Add silence interval
    const silenceSecs = seg.silenceSecondsAfter || 1;
    if (silenceSecs > 0) {
      pcmList.push(createSilencePcm(silenceSecs));
    }
  }

  // Combine full PCM
  const fullPcm = Buffer.concat(pcmList);
  const fullHeader = writeWavHeader(fullPcm.length, 24000);
  const fullWav = Buffer.concat([fullHeader, fullPcm]);

  const fullWavPath = path.join(AUDIO_CACHE_DIR, 'demo-greetings-01-full.wav');
  fs.writeFileSync(fullWavPath, fullWav);
  console.log(`Generated full demo WAV: ${fullWavPath} (${Math.round(fullWav.length / 1024)} KB)`);

  episode.fullAudioUrl = '/audio/demo-greetings-01-full.wav';

  // Save to episodes.json
  fs.writeFileSync(EPISODES_FILE, JSON.stringify([episode], null, 2), 'utf-8');
  console.log('Updated data/episodes.json successfully with full segments and audioUrls!');
}

main().catch((err) => {
  console.error('Error in script:', err);
  process.exit(1);
});

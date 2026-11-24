import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { DEMO_EPISODE } from '../src/data/demoEpisode';

dotenv.config();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');
const EPISODES_FILE = path.join(DATA_DIR, 'episodes.json');

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

async function synthesizeText(text: string, voice: string, style?: string): Promise<Buffer> {
  const cleanKey = `part4_${voice}_${Buffer.from(text).toString('hex').slice(0, 16)}.wav`;
  const cachedPath = path.join(AUDIO_CACHE_DIR, cleanKey);
  if (fs.existsSync(cachedPath)) {
    console.log(`Using cached snippet for: "${text}"`);
    return fs.readFileSync(cachedPath);
  }

  console.log(`Synthesizing [${voice}]: "${text}"...`);
  let attempts = 0;
  while (attempts < 3) {
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text,
                speechMetadata: style ? { style } : undefined,
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

      const b64 = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!b64) throw new Error(`TTS failed for: ${text}`);
      const buf = Buffer.from(b64, 'base64');
      fs.writeFileSync(cachedPath, buf);
      return buf;
    } catch (err: any) {
      if (err.status === 429 || (err.message && err.message.includes('429'))) {
        console.log('Hit rate limit (429), waiting 24s before retry...');
        await new Promise((r) => setTimeout(r, 24000));
        attempts++;
      } else {
        throw err;
      }
    }
  }
  throw new Error(`TTS failed after retries for: ${text}`);
}

async function generateCleanPart4AndRecompile() {
  console.log('=== GENERATING CLEAN PART 4 (LISTEN & REPEAT PRONUNCIATION) ===');

  const pcmList: Buffer[] = [];

  // 1. Cô Mai intro in Vietnamese
  const introWav = await synthesizeText(
    'Bây giờ là phần luyện phát âm nghe và nhắc lại. Thầy David sẽ đọc từng từ vựng, sau mỗi từ sẽ có khoảng dừng để các em nhắc lại thật to nhé!',
    'Aoede',
    'Warm, encouraging Vietnamese primary school teacher (Cô Mai)'
  );
  if (introWav.length > 44) pcmList.push(introWav.subarray(44));

  // 1.8 seconds pause after intro
  pcmList.push(createSilencePcm(1.8));

  // 2. Vocabulary words: Hello, Goodbye, Thank you
  const vocabWords = ['Hello.', 'Goodbye.', 'Thank you.'];

  for (let i = 0; i < vocabWords.length; i++) {
    const word = vocabWords[i];
    console.log(`Synthesizing clean word: ${word}`);
    const wordWav = await synthesizeText(
      word,
      'Puck',
      'Clear, natural, encouraging American English pronunciation for children. Speak only this word clearly.'
    );

    if (wordWav.length > 44) {
      pcmList.push(wordWav.subarray(44));
    }

    // Insert 4.5 seconds of silence so students have ample time to repeat aloud in class!
    console.log(`Inserting 4.5s silence after "${word}" for student repeat...`);
    pcmList.push(createSilencePcm(4.5));
  }

  // 3. Cô Mai praise
  const praiseWav = await synthesizeText(
    'Cả lớp nhắc lại rất to và rõ ràng! Giỏi lắm các em!',
    'Aoede',
    'Cheerful and proud Vietnamese teacher'
  );
  if (praiseWav.length > 44) pcmList.push(praiseWav.subarray(44));

  // Combine Part 4 WAV
  const part4Pcm = Buffer.concat(pcmList);
  const part4Header = writeWavHeader(part4Pcm.length, 24000);
  const part4Wav = Buffer.concat([part4Header, part4Pcm]);

  const part4Path = path.join(AUDIO_CACHE_DIR, 'demo_part_4.wav');
  fs.writeFileSync(part4Path, part4Wav);
  console.log(`Saved clean demo_part_4.wav: ${part4Path} (${Math.round(part4Wav.length / 1024)} KB)`);

  // Now recompile master program WAV
  console.log('\n=== RECOMPILING MASTER PROGRAM WAV (demo-greetings-01-full.wav) ===');
  const masterPcmList: Buffer[] = [];

  // Prepend radio intro jingle
  const jinglePath = path.join(AUDIO_CACHE_DIR, 'radio_intro_jingle.wav');
  if (fs.existsSync(jinglePath)) {
    const jingleBuf = fs.readFileSync(jinglePath);
    if (jingleBuf.length > 44) {
      masterPcmList.push(jingleBuf.subarray(44));
      masterPcmList.push(createSilencePcm(0.8));
      console.log('Prepended radio intro jingle!');
    }
  }

  // Part 1, 2, 3, 4
  const parts = ['demo_part_1.wav', 'demo_part_2.wav', 'demo_part_3.wav', 'demo_part_4.wav'];
  for (const p of parts) {
    const fullP = path.join(AUDIO_CACHE_DIR, p);
    if (fs.existsSync(fullP)) {
      const b = fs.readFileSync(fullP);
      if (b.length > 44) {
        masterPcmList.push(b.subarray(44));
        masterPcmList.push(createSilencePcm(2.0));
      }
    }
  }

  const masterPcm = Buffer.concat(masterPcmList);
  const masterHeader = writeWavHeader(masterPcm.length, 24000);
  const masterWav = Buffer.concat([masterHeader, masterPcm]);

  const masterPath = path.join(AUDIO_CACHE_DIR, 'demo-greetings-01-full.wav');
  fs.writeFileSync(masterPath, masterWav);
  console.log(`Successfully compiled master WAV: ${masterPath} (${Math.round(masterWav.length / 1024)} KB)`);

  // Update data/episodes.json with DEMO_EPISODE
  const episode = JSON.parse(JSON.stringify(DEMO_EPISODE));
  episode.fullAudioUrl = '/audio/demo-greetings-01-full.wav';

  for (const s of episode.segments) {
    if (s.part <= 4) {
      s.audioUrl = `/audio/demo_part_${s.part}.wav`;
      s.synthesized = true;
    }
  }

  fs.writeFileSync(EPISODES_FILE, JSON.stringify([episode], null, 2), 'utf-8');
  console.log('Successfully updated data/episodes.json!');
}

generateCleanPart4AndRecompile().catch((err) => {
  console.error('Error generating clean Part 4:', err);
  process.exit(1);
});

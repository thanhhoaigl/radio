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

// Group segments by Part (Part 1, 2, 3, 4, 5, 6)
async function generateEpisodeAudio() {
  console.log('Generating complete audio for DEMO_EPISODE using gemini-3.8-flash-tts...');
  const episode = JSON.parse(JSON.stringify(DEMO_EPISODE));
  const fullPcmChunks: Buffer[] = [];

  // Group segments by part
  const partsMap = new Map<number, typeof DEMO_EPISODE.segments>();
  for (const seg of episode.segments) {
    if (!partsMap.has(seg.part)) partsMap.set(seg.part, []);
    partsMap.get(seg.part)!.push(seg);
  }

  for (const [partNum, segs] of partsMap.entries()) {
    console.log(`\n--- Synthesizing Part ${partNum} (${segs[0].partNameVi}) with ${segs.length} segments ---`);
    const partKey = `demo_part_${partNum}`;
    const partFilePath = path.join(AUDIO_CACHE_DIR, `${partKey}.wav`);

    let partWavBuf: Buffer;

    if (fs.existsSync(partFilePath)) {
      console.log(`Using cached Part ${partNum}: ${partFilePath}`);
      partWavBuf = fs.readFileSync(partFilePath);
    } else {
      // Build multi-speaker parts
      const partsPayload = segs.map((s) => {
        const isVi = s.language === 'vi';
        return {
          text: `${isVi ? 'Mai' : 'David'}: ${s.spokenText}`,
          speechMetadata: {
            speaker: isVi ? 'Mai' : 'David',
            style: isVi
              ? 'Warm, gentle Vietnamese primary school teacher (Cô Mai)'
              : 'Encouraging, cheerful male American English teacher for children (Thầy David)',
          },
        };
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: partsPayload,
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: 'Mai',
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                },
                {
                  speaker: 'David',
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
                },
              ],
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error(`Failed to generate Part ${partNum}`);
      }
      partWavBuf = Buffer.from(base64Audio, 'base64');
      fs.writeFileSync(partFilePath, partWavBuf);
      console.log(`Generated Part ${partNum} audio: ${Math.round(partWavBuf.length / 1024)} KB`);
    }

    // Attach part audio to segments
    for (const s of segs) {
      s.audioUrl = `/audio/${partKey}.wav`;
      s.synthesized = true;
    }

    if (partWavBuf.length > 44) {
      fullPcmChunks.push(partWavBuf.subarray(44));
      // Add pause between parts
      fullPcmChunks.push(createSilencePcm(2.5));
    }
  }

  // Also synthesize individual target words for 1-click word cards
  console.log('\nSynthesizing individual target words for flashcards...');
  for (const word of episode.targetWords) {
    const wordKey = getAudioKey(word.english, 'Puck', 'en');
    const wordPath = path.join(AUDIO_CACHE_DIR, `${wordKey}.wav`);
    if (!fs.existsSync(wordPath)) {
      console.log(`Synthesizing word: ${word.english}`);
      const wordRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `David: ${word.english}.`,
                speechMetadata: {
                  speaker: 'David',
                  style: 'Clear, encouraging male American English pronunciation for young children (Thầy David)',
                },
              },
              {
                text: `Mai: ${word.vietnamese}.`,
                speechMetadata: {
                  speaker: 'Mai',
                  style: 'Gentle Vietnamese teacher (Cô Mai)',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                { speaker: 'David', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
                { speaker: 'Mai', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
              ],
            },
          },
        },
      });
      const b64 = wordRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64) {
        fs.writeFileSync(wordPath, Buffer.from(b64, 'base64'));
        word.audioUrl = `/audio/${wordKey}.wav`;
      }
    } else {
      word.audioUrl = `/audio/${wordKey}.wav`;
    }
  }

  // Combine full program master WAV
  const fullPcm = Buffer.concat(fullPcmChunks);
  const fullHeader = writeWavHeader(fullPcm.length, 24000);
  const fullWav = Buffer.concat([fullHeader, fullPcm]);

  const fullWavPath = path.join(AUDIO_CACHE_DIR, 'demo-greetings-01-full.wav');
  fs.writeFileSync(fullWavPath, fullWav);
  console.log(`\nGenerated master program WAV: ${fullWavPath} (${Math.round(fullWav.length / 1024)} KB)`);

  episode.fullAudioUrl = '/audio/demo-greetings-01-full.wav';

  // Save complete episode into episodes.json
  fs.writeFileSync(EPISODES_FILE, JSON.stringify([episode], null, 2), 'utf-8');
  console.log('Saved complete episode into data/episodes.json successfully!');
}

generateEpisodeAudio().catch((e) => {
  console.error('Error generating audio:', e);
  process.exit(1);
});

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '50mb' }));

// Ensure data folder exists
const DATA_DIR = path.resolve(process.cwd(), 'data');
const EPISODES_FILE = path.join(DATA_DIR, 'episodes.json');
const AUDIO_CACHE_DIR = path.join(DATA_DIR, 'audio-cache');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

// Serve audio files directly
app.use('/audio', express.static(AUDIO_CACHE_DIR, {
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Accept-Ranges', 'bytes');
  },
}));

// In-memory audio cache: Map<string, string> (hash -> base64)
const audioMemoryCache = new Map<string, string>();

// Helper to hash audio request
function getAudioKey(text: string, voice: string, language: string): string {
  const versionTag = language === 'vi' ? 'kore_flash_tts_' : 'puck_flash_tts_';
  const clean = `${language}_${voice}_${versionTag}${text.trim().toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return `tts_${Math.abs(hash)}`;
}

// Initialize Google GenAI
const aiApiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (aiApiKey) {
  aiClient = new GoogleGenAI({
    apiKey: aiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Load episodes helper
function loadEpisodes(): any[] {
  try {
    if (fs.existsSync(EPISODES_FILE)) {
      const data = fs.readFileSync(EPISODES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading episodes.json:', err);
  }
  return [];
}

// Save episodes helper
function saveEpisodes(episodes: any[]): void {
  try {
    fs.writeFileSync(EPISODES_FILE, JSON.stringify(episodes, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing episodes.json:', err);
  }
}

// Seed demo episode if empty
const existingEpisodes = loadEpisodes();
if (existingEpisodes.length === 0) {
  // We will seed the Greetings demo episode
  const demoSeed = {
    id: 'demo-greetings-01',
    title: 'Số 01: Lời chào thân thương cùng Happy English Radio',
    topicId: 'greetings',
    topicTitleVi: 'Chào hỏi thân thiện',
    topicTitleEn: 'Greetings',
    targetWords: [
      {
        id: 'greet_1',
        english: 'Hello',
        vietnamese: 'Xin chào',
        phonetic: '/həˈloʊ/',
        exampleEn: 'Hello, teacher!',
        exampleVi: 'Xin chào cô giáo!',
        icon: '👋',
      },
      {
        id: 'greet_2',
        english: 'Goodbye',
        vietnamese: 'Tạm biệt',
        phonetic: '/ˌɡʊdˈbaɪ/',
        exampleEn: 'Goodbye, my friend!',
        exampleVi: 'Tạm biệt bạn của mình nhé!',
        icon: '🙋',
      },
      {
        id: 'greet_3',
        english: 'Thank you',
        vietnamese: 'Cảm ơn',
        phonetic: '/ˈθæŋk juː/',
        exampleEn: 'Thank you very much!',
        exampleVi: 'Cảm ơn bạn rất nhiều!',
        icon: '🙏',
      },
    ],
    durationMinutes: 5,
    voiceVi: 'Kore',
    voiceEn: 'Puck',
    bgmType: 'happy_playful',
    bgmVolume: 0.15,
    published: true,
    createdAt: new Date().toISOString(),
    notesVi: 'Tập phát thanh mẫu đầu tiên giúp các em học sinh tiểu học làm quen với 3 từ cơ bản: Hello, Goodbye và Thank you.',
  };
  saveEpisodes([demoSeed]);
}

// --- API ROUTES ---

// Helper: parse RIFF WAV chunks and strip any trailing non-audio metadata (e.g., C2PA)
function extractCleanWav(wavBuffer: Buffer): Buffer {
  if (wavBuffer.length < 44 || wavBuffer.toString('ascii', 0, 4) !== 'RIFF') {
    return wavBuffer;
  }
  let offset = 12; // Skip 'RIFF' + size + 'WAVE'
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let pcmData: Buffer | null = null;

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
      pcmData = wavBuffer.subarray(dataStart, dataEnd);
      break;
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  if (!pcmData) {
    return wavBuffer;
  }

  const cleanPcm = Buffer.from(pcmData);
  // Apply tiny 8ms fade-out at tail to prevent any click
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

  return Buffer.concat([header, cleanPcm]);
}

// Helper: determine HTTP status & transient retryability from Gemini SDK errors
function extractErrorStatus(err: any): number | undefined {
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.code === 'number') return err.code;
  const msg = String(err?.message || '');
  const match = msg.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : undefined;
}

function isTransientGeminiError(err: any): boolean {
  const status = extractErrorStatus(err);
  if (status && [408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  const msg = String(err?.message || '');
  return /503|502|504|500|429|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|high demand|overloaded|temporarily|try again|timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed|abort|AbortError/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1200
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: any) {
      lastError = err;
      const status = extractErrorStatus(err);
      const transient = isTransientGeminiError(err);
      console.warn(`[Gemini] ${label} attempt ${attempt}/${maxAttempts} failed (status=${status ?? 'unknown'}): ${err?.message || err}`);
      if (!transient || attempt === maxAttempts) {
        break;
      }
      const jitter = Math.floor(Math.random() * 400);
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
      await sleep(delay);
    }
  }
  throw lastError;
}

// 1. Text-To-Speech API (Gemini TTS)
app.post('/api/tts', async (req, res) => {
  try {
    const { text, language = 'vi', style } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Nội dung văn bản (text) không được để trống.' });
    }

    // Enforce consistent signature voices matching Góc Học Sinh (Cô Mai = Kore Southern VN, Thầy David = Puck US EN)
    const targetVoice = language === 'vi' ? 'Kore' : 'Puck';
    const cacheKey = getAudioKey(text, targetVoice, language);

    // Check in-memory cache
    if (audioMemoryCache.has(cacheKey)) {
      return res.json({
        audioBase64: audioMemoryCache.get(cacheKey),
        mimeType: 'audio/wav',
        cached: true,
      });
    }

    // Check disk cache (ensure clean WAV without trailing C2PA bytes)
    const diskPath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.wav`);
    if (fs.existsSync(diskPath)) {
      const rawBuffer = fs.readFileSync(diskPath);
      const cleanBuffer = extractCleanWav(rawBuffer);
      if (cleanBuffer.length !== rawBuffer.length) {
        fs.writeFileSync(diskPath, cleanBuffer);
      }
      const b64 = cleanBuffer.toString('base64');
      audioMemoryCache.set(cacheKey, b64);
      return res.json({
        audioBase64: b64,
        mimeType: 'audio/wav',
        cached: true,
      });
    }

    if (!aiClient) {
      return res.status(500).json({
        error: 'Khóa API Gemini chưa được cấu hình. Vui lòng kiểm tra GEMINI_API_KEY trong phần Settings > Secrets.',
      });
    }

    // Craft instruction matching the exact voice persona in Góc Học Sinh (Southern Vietnamese Cô Mai + American English Thầy David)
    const promptStyle =
      style ||
      (language === 'vi'
        ? 'Warm, gentle Southern Vietnamese female primary school teacher (Cô Mai)'
        : 'Encouraging, cheerful male American English teacher for children (Thầy David)');

    const promptText = text;

    const callTtsModel = async (modelName: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await aiClient!.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: promptText,
                  speechMetadata: {
                    style: promptStyle,
                  },
                },
              ],
            },
          ],
          config: {
            abortSignal: controller.signal,
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: targetVoice },
              },
            },
          },
        });
        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!audioData) {
          throw new Error(`Mô hình ${modelName} không trả về dữ liệu âm thanh hợp lệ.`);
        }
        return audioData;
      } finally {
        clearTimeout(timer);
      }
    };

    // Prefer gemini-3.8-flash-tts (matches the exact voice model & timbre in StudentClassroom / Góc Học Sinh) with fallback to gemini-3.8-flash-lite-tts
    let base64Audio: string | undefined;
    try {
      base64Audio = await retryWithBackoff('TTS gemini-3.8-flash-tts', () => callTtsModel('gemini-3.8-flash-tts'), 2, 1200);
    } catch (flashErr: any) {
      console.warn('gemini-3.8-flash-tts failed, falling back to gemini-3.8-flash-lite-tts:', flashErr?.message || flashErr);
      base64Audio = await retryWithBackoff('TTS gemini-3.8-flash-lite-tts', () => callTtsModel('gemini-3.8-flash-lite-tts'), 2, 1200);
    }

    if (!base64Audio) {
      throw new Error('Mô hình Gemini TTS không trả về dữ liệu âm thanh hợp lệ.');
    }

    // Strip any trailing C2PA metadata chunk before caching & serving
    const cleanWavBuffer = extractCleanWav(Buffer.from(base64Audio, 'base64'));
    const cleanB64 = cleanWavBuffer.toString('base64');

    // Save to cache
    audioMemoryCache.set(cacheKey, cleanB64);
    fs.writeFileSync(diskPath, cleanWavBuffer);

    return res.json({
      audioBase64: cleanB64,
      audioUrl: `/audio/${cacheKey}.wav`,
      mimeType: 'audio/wav',
      cached: false,
    });
  } catch (error: any) {
    console.error('Error generating TTS:', error);
    const status = extractErrorStatus(error);
    const msg = String(error?.message || '');

    if (status === 503 || /503|UNAVAILABLE|high demand/i.test(msg)) {
      return res.status(503).json({
        error: 'Hệ thống giọng nói AI đang quá tải tạm thời (503). Vui lòng bấm thử lại sau vài giây.',
        retryable: true,
      });
    }
    if (status === 429 || /429|RESOURCE_EXHAUSTED/i.test(msg)) {
      return res.status(429).json({
        error: 'Đã đạt giới hạn lượt gọi giọng nói AI (429). Vui lòng đợi khoảng 20–30 giây rồi thử lại.',
        retryable: true,
      });
    }
    if (status === 403 || status === 400 || /PERMISSION_DENIED|API_KEY_INVALID/i.test(msg)) {
      return res.status(status || 400).json({
        error: 'Khóa API Gemini không hợp lệ hoặc chưa đủ quyền. Vui lòng kiểm tra GEMINI_API_KEY trong Settings > Secrets.',
      });
    }
    return res.status(500).json({
      error: `Lỗi tạo giọng nói AI: ${msg || 'Không thể tạo âm thanh từ Gemini TTS'}. Vui lòng thử lại.`,
    });
  }
});

// 2. Generate Radio Script using Gemini 4 Hydrogen (with fast fallback to Gemini 3.1 Flash Lite & optional SSE streaming)
app.post('/api/generate-script', async (req, res) => {
  const wantsStream =
    Boolean(req.body?.stream) ||
    String(req.headers.accept || '').includes('text/event-stream');

  const sendSse = (event: string, payload: any) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  try {
    const {
      topicTitleVi,
      topicTitleEn,
      targetWords,
      durationMinutes = 5,
      sentencePattern,
    } = req.body;

    if (!targetWords || !Array.isArray(targetWords) || targetWords.length === 0) {
      return res.status(400).json({ error: 'Cần ít nhất 3 từ vựng để tạo kịch bản.' });
    }

    if (!aiClient) {
      return res.status(500).json({
        error: 'Khóa API Gemini chưa được cấu hình. Vui lòng kiểm tra biến môi trường GEMINI_API_KEY trong Settings > Secrets.',
      });
    }

    if (wantsStream) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      sendSse('status', { message: 'Đang kết nối AI viết kịch bản song ngữ...' });
      heartbeatTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 2000);
    }

    const wordsDescription = targetWords
      .map(
        (w: any, idx: number) =>
          `${idx + 1}. ${w.english} (${w.phonetic || ''}) — Nghĩa: "${w.vietnamese}" — Câu ví dụ: "${w.exampleEn || ''}" (${w.exampleVi || ''})`
      )
      .join('\n');

    const patternInstruction = sentencePattern
      ? `\nMẪU CÂU GIAO TIẾP TRỌNG TÂM CẦN VẬN DỤNG VÀO BÀI HỌC:
- Mẫu câu hỏi: "${sentencePattern.questionEn}" (Nghĩa: "${sentencePattern.questionVi}")
- Mẫu câu trả lời: "${sentencePattern.answerPatternEn || sentencePattern.answerExampleEn}" (Ví dụ mẫu: "${sentencePattern.answerExampleEn}" — "${sentencePattern.answerExampleVi}")
- Hướng dẫn sư phạm: Trong Phần 2 (sau khi học xong từ vựng), Phần 3 (đố vui tình huống) và Phần 5 (thử thách đối đáp), hãy để Cô Mai và Thầy David đóng vai trò chuyện tự nhiên bằng mẫu câu này, hướng dẫn các em ghép từng từ vừa học vào câu nói thật sinh động!`
      : '';

    const isSevenMin = Number(durationMinutes) >= 7;
    const targetSegmentRange = isSevenMin ? '32 đến 40 phân đoạn' : '26 đến 32 phân đoạn';
    const quizCount = isSevenMin ? 3 : 2;

    const systemInstruction = `Bạn là nhà văn viết kịch bản phát thanh thiếu nhi và chuyên gia giáo dục tiểu học hàng đầu của chương trình "HAPPY ENGLISH RADIO STUDIO" — đài phát thanh tiếng Anh song ngữ dành riêng cho học sinh tiểu học (đặc biệt là các em học sinh vùng cao, dân tộc thiểu số mới làm quen với tiếng Anh).

PHONG CÁCH LỜI VĂN & CHẤT LƯỢNG NỘI DUNG:
1. Lời văn tiếng Việt của "Cô Mai (Việt Nam)" phải thật HAY, GIÀU CẢM XÚC, MƯỢT MÀ VÀ CÓ HÌNH ẢNH:
   - Viết như lời tâm tình, kể chuyện ấm áp trên làn sóng phát thanh; tuyệt đối tránh văn phong khô khan, máy móc, liệt kê kiểu "Từ thứ nhất là...", "Tiếp theo là...".
   - Biết cách vẽ ra khung cảnh gần gũi với tuổi thơ (nắng sớm trên sân trường, trang vở mới, tiếng chim hót ngoài hiên, nụ cười của người bạn ngồi cạnh), dùng từ ngữ gợi tả tinh tế, nhịp câu uyển chuyển, truyền cảm hứng yêu thích tiếng Anh.
   - Mỗi lượt lời của Cô Mai (trừ các câu chuyển ngắn) nên có độ dài đầy đặn từ 2 đến 4 câu (khoảng 35–75 từ tiếng Việt) để nội dung sâu sắc, giàu tính sư phạm và đủ thời lượng phát thanh.
2. Lời thoại tiếng Anh của "Thầy David (Mỹ)":
   - Giữ cấu trúc câu NGẮN GỌN, TỪ VỰNG ĐƠN GIẢN, DỄ HIỂU cho học sinh tiểu học mới bắt đầu (tuyệt đối không dùng ngữ pháp phức tạp hay từ hiếm).
   - Nhưng ngữ điệu phải ấm áp, hóm hỉnh, truyền cảm hứng và tương tác tự nhiên với Cô Mai ("Good morning, Cô Mai! Hello, dear little friends!", "Listen closely and feel the joyful rhythm!", "Bravo! Your voices sound like sweet morning music!").
3. Độ dài tổng thể:
   - Tạo kịch bản ĐẦY ĐẶN, CHI TIẾT gồm ${targetSegmentRange} (ScriptSegment), đảm bảo khi ghép với khoảng lặng thực tế sẽ đạt trọn vẹn thời lượng ${durationMinutes} phút.
4. Quy tắc SẮT ĐÁ cho Phần 4 (Nghe và Nhắc lại):
   - Với các lượt đọc từ vựng của Thầy David ở Phần 4, "spokenText" CHỈ ĐƯỢC CHỨA DUY NHẤT TỪ VỰNG TIẾNG ANH ĐÓ (ví dụ: "Hello." hoặc "Thank you.").
   - Tuyệt đối KHÔNG thêm tên nhân vật ("David", "Teacher"), KHÔNG đánh số thứ tự ("Number 1", "One"), KHÔNG thêm câu dẫn vào spokenText của các lượt đọc từ ở Phần 4, và đặt "silenceSecondsAfter": 5.`;

    const prompt = `Hãy viết một kịch bản phát thanh song ngữ hoàn chỉnh, dài dặn và giàu cảm xúc cho chủ đề: "${topicTitleVi}" (${topicTitleEn}).

THÔNG SỐ CHƯƠNG TRÌNH:
- Thời lượng mục tiêu: ${durationMinutes} phút (tối thiểu ${targetSegmentRange}).
- Phương pháp sư phạm: NGHE → NHẮC LẠI → HIỂU → NHỚ → SỬ DỤNG.
- Danh sách ${targetWords.length} từ vựng trọng tâm:
${wordsDescription}
${patternInstruction}
CẤU TRÚC 6 PHẦN BẮT BUỘC (Mỗi phần phải chuyển tiếp duyên dáng, mạch lạc):

1. Phần 1: Chào mừng (Welcome) — 3 đến 4 phân đoạn:
   - Cô Mai mở đầu bằng một hình ảnh gợi cảm xúc tươi đẹp của buổi sáng hoặc giờ học, chào đón các em đến với Happy English Radio và khơi gợi sự tò mò về chủ đề "${topicTitleVi}".
   - Thầy David chào đón rạng rỡ bằng tiếng Anh đơn giản, tương tác lại với Cô Mai và cổ vũ các bạn nhỏ trước khi bắt đầu.
   - Cô Mai giới thiệu nhẹ nhàng hành trình khám phá ${targetWords.length} từ khóa hôm nay.

2. Phần 2: Học từ vựng & Mẫu câu (Vocabulary & Pattern) — Chiếm trọng tâm chương trình:
   - Với MỖI từ vựng trong ${targetWords.length} từ:
     + Cô Mai kể một mẩu tình huống nhỏ hoặc gợi hình ảnh quen thuộc dẫn dắt tới nghĩa tiếng Việt của từ, mời cả lớp lắng nghe Thầy David.
     + Thầy David phát âm rõ từng từ một lần, sau đó đọc lại kèm câu ví dụ ngắn gắn với từ đó (ví dụ: "Hello! Hello, teacher! Repeat after me: Hello!"), đặt silenceSecondsAfter = 3.
     + Cô Mai giải thích âu yếm ngữ cảnh dùng từ trong cuộc sống hằng ngày ở trường, ở nhà và khen ngợi các em.
   - Sau khi học hết các từ: Cô Mai và Thầy David cùng nhau ghép từ vào Mẫu câu giao tiếp trọng tâm, diễn một đoạn đối thoại ngắn 2–3 lượt làm mẫu thật tự nhiên.

3. Phần 3: Nghe và Đoán (Listen and Guess) — ${quizCount} câu đố tình huống sinh động:
   - Cô Mai đặt ra từng câu đố dưới dạng câu chuyện/tình huống nhỏ gần gũi, gợi mở trí tưởng tượng, đặt silenceSecondsAfter = 4 để cả lớp đồng thanh đoán.
   - Thầy David vui vẻ công bố đáp án bằng tiếng Anh kèm câu khen ngợi ấm áp, rồi Cô Mai nối lời khích lệ tinh thần học tập của các em.

4. Phần 4: Nghe và Nhắc lại (Listen and Repeat):
   - 1 đoạn Cô Mai hướng dẫn các em ngồi ngay ngắn, hít một hơi thật sâu và đọc vang theo Thầy David sau tiếng chuông nhẹ.
   - ${targetWords.length} đoạn Thầy David đọc lần lượt từng từ vựng (TUÂN THỦ NGHIÊM NGẶT: spokenText CHỈ LÀ TỪ VỰNG ĐÓ, ví dụ "Hello.", KHÔNG đánh số, KHÔNG lời dẫn, silenceSecondsAfter = 5).
   - 1 đoạn Cô Mai khen ngợi giọng đọc đồng thanh vang dội, truyền cảm của cả lớp.

5. Phần 5: Thử thách nhỏ (Mini Challenge) — 3 đến 4 phân đoạn:
   - Cô Mai tổ chức một hoạt động thực hành giao tiếp đôi (hai bạn ngồi cạnh quay sang nói với nhau) hoặc cả lớp cùng vận dụng từ vựng + mẫu câu trong tình huống thực tế (silenceSecondsAfter = 5).
   - Thầy David hưởng ứng nhiệt tình, làm mẫu lại câu chúc/câu đáp và tặng lời khen rực rỡ.

6. Phần 6: Ôn tập và Tạm biệt (Review and Goodbye) — 3 đến 4 phân đoạn:
   - Cô Mai tổng kết lại toàn bộ ${targetWords.length} từ vựng và mẫu câu bằng giọng văn lưu luyến, đồng thời trao cho các em một "nhiệm vụ nhỏ đáng yêu trong ngày" (ví dụ: tối nay về nhà nói lời chào/cảm ơn bằng tiếng Anh với bố mẹ, ông bà hoặc người bạn thân).
   - Thầy David gửi lời tạm biệt chân thành, hẹn gặp lại ở số phát sóng sau.
   - Cô Mai khép lại chương trình bằng lời chúc một ngày học tập ngập tràn niềm vui.

Hãy trả về kết quả JSON là một mảng các đối tượng ScriptSegment với các trường:
- part (1..6)
- partNameVi (tên tiếng Việt rõ ràng của phần đó)
- speaker ("mc_vietnamese" hoặc "mc_english")
- speakerName ("Cô Mai (Việt Nam)" hoặc "Thầy David (Mỹ)")
- spokenText (lời thoại chính xác sẽ đọc thành tiếng)
- textVi (nghĩa tiếng Việt hoặc ghi chú sư phạm ngắn cho giáo viên)
- language ("vi" hoặc "en")
- silenceSecondsAfter (số nguyên 1–5 giây)`;

    const responseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          part: { type: Type.INTEGER },
          partNameVi: { type: Type.STRING },
          speaker: { type: Type.STRING },
          speakerName: { type: Type.STRING },
          spokenText: { type: Type.STRING },
          textVi: { type: Type.STRING },
          language: { type: Type.STRING },
          silenceSecondsAfter: { type: Type.INTEGER },
        },
        required: ['part', 'partNameVi', 'speaker', 'speakerName', 'spokenText', 'language'],
      },
    };

    const callModelStream = async (modelName: string, useThinkingLow: boolean, totalTimeoutMs = 45000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), totalTimeoutMs);
      try {
        const stream = await aiClient!.models.generateContentStream({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            abortSignal: controller.signal,
            responseMimeType: 'application/json',
            responseSchema,
            ...(useThinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          },
        });
        let fullText = '';
        for await (const chunk of stream) {
          if (chunk.text) {
            fullText += chunk.text;
          }
        }
        if (!fullText.trim()) {
          throw new Error(`Mô hình ${modelName} trả về nội dung rỗng.`);
        }
        return fullText;
      } finally {
        clearTimeout(timer);
      }
    };

    // Prefer gemini-4-hydrogen for rich, expressive bilingual storytelling (with fast fallback to gemini-3.1-flash-lite)
    let segmentsText = '';
    const attemptErrors: string[] = [];

    const tryModel = async (label: string, modelName: string, useThinkingLow: boolean, timeoutMs: number) => {
      try {
        return await callModelStream(modelName, useThinkingLow, timeoutMs);
      } catch (err: any) {
        const st = extractErrorStatus(err) ?? 'ERR';
        const shortMsg = String(err?.message || err).slice(0, 180);
        attemptErrors.push(`${label}[${st}]: ${shortMsg}`);
        throw err;
      }
    };

    try {
      if (wantsStream) sendSse('status', { message: 'Đang soạn kịch bản song ngữ giàu cảm xúc với Gemini 4 Hydrogen...' });
      segmentsText = await retryWithBackoff(
        'Script gemini-4-hydrogen',
        (attempt) => {
          if (wantsStream && attempt > 1) {
            sendSse('status', { message: 'Máy chủ AI đang bận, tự động thử lại lần 2...' });
          }
          return tryModel(`gemini-4-hydrogen(${attempt})`, 'gemini-4-hydrogen', true, 45000);
        },
        2,
        1500
      );
    } catch (hydrogenErr: any) {
      console.warn('gemini-4-hydrogen failed, trying gemini-3.1-flash-lite fallback:', hydrogenErr?.message || hydrogenErr);
      if (wantsStream) sendSse('status', { message: 'Đang chuyển sang mô hình dự phòng Gemini Flash Lite...' });
      try {
        segmentsText = await tryModel('gemini-3.1-flash-lite(1)', 'gemini-3.1-flash-lite', false, 35000);
      } catch (liteErr: any) {
        (liteErr as any).attemptErrors = attemptErrors;
        throw liteErr;
      }
    }

    let cleanedText = segmentsText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    const parsedRaw = JSON.parse(cleanedText);
    const parsedSegments = Array.isArray(parsedRaw)
      ? parsedRaw
      : Array.isArray(parsedRaw?.segments)
        ? parsedRaw.segments
        : [];

    if (!Array.isArray(parsedSegments) || parsedSegments.length === 0) {
      throw new Error('Mô hình AI không trả về danh sách phân đoạn kịch bản hợp lệ.');
    }

    // Add unique IDs and normalize each segment
    const segmentsWithIds = parsedSegments.map((seg: any, index: number) => ({
      id: `seg-${Date.now()}-${index}`,
      part: Number(seg.part) || 1,
      partNameVi: seg.partNameVi || `Phần ${Number(seg.part) || 1}`,
      speaker: seg.speaker === 'mc_english' || seg.language === 'en' ? 'mc_english' : 'mc_vietnamese',
      speakerName: seg.speakerName || (seg.language === 'en' ? 'Thầy David (Mỹ)' : 'Cô Mai (Việt Nam)'),
      spokenText: String(seg.spokenText || '').trim(),
      textVi: seg.textVi || '',
      language: seg.language === 'en' ? 'en' : 'vi',
      silenceSecondsAfter: typeof seg.silenceSecondsAfter === 'number' ? Math.max(0, Math.min(8, seg.silenceSecondsAfter)) : 1,
    })).filter((s: any) => s.spokenText.length > 0);

    const payload = {
      segments: segmentsWithIds,
      title: `Số phát thanh: ${topicTitleVi} - Happy English Radio`,
    };

    if (heartbeatTimer) clearInterval(heartbeatTimer);

    if (wantsStream) {
      sendSse('complete', payload);
      return res.end();
    }

    return res.json(payload);
  } catch (error: any) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.error('Error generating script:', error);
    const status = extractErrorStatus(error);
    const msg = String(error?.message || '');
    const attemptErrors = (error as any)?.attemptErrors;

    let httpStatus = 500;
    let friendly = msg ? `Lỗi tạo kịch bản AI: ${msg}` : 'Không thể tạo kịch bản từ Gemini AI. Vui lòng thử lại sau ít phút.';
    let retryable = false;

    if (status === 503 || /503|UNAVAILABLE|high demand|overloaded/i.test(msg)) {
      httpStatus = 503;
      friendly = 'Máy chủ AI miễn phí đang quá tải tạm thời (503). Vui lòng bấm "Thử Lại Ngay" sau vài giây hoặc dùng nút "Tạo Nhanh Từ Khung Chuẩn" bên cạnh để không bị gián đoạn.';
      retryable = true;
    } else if (status === 429 || /429|RESOURCE_EXHAUSTED/i.test(msg)) {
      httpStatus = 429;
      friendly = 'Gói miễn phí đang tạm chạm giới hạn lượt gọi mỗi phút (429). Bạn hoàn toàn không cần trả phí: chỉ cần đợi khoảng 20–30 giây rồi bấm "Thử Lại Ngay", hoặc dùng nút "Tạo Nhanh Từ Khung Chuẩn".';
      retryable = true;
    } else if (status === 403 || status === 400 || /PERMISSION_DENIED|API_KEY_INVALID/i.test(msg)) {
      httpStatus = status || 400;
      friendly = 'Khóa API Gemini chưa hợp lệ hoặc chưa đủ quyền (400/403). Vui lòng kiểm tra GEMINI_API_KEY trong phần Settings > Secrets.';
    } else if (status === 404 || /NOT_FOUND/i.test(msg)) {
      httpStatus = 404;
      friendly = 'Mô hình AI được yêu cầu không khả dụng (404). Vui lòng kiểm tra cấu hình mô hình.';
    } else if (/abort|AbortError|timeout/i.test(msg)) {
      httpStatus = 504;
      friendly = 'Kết nối đến Gemini AI mất quá nhiều thời gian phản hồi. Vui lòng bấm "Thử Lại Ngay" hoặc dùng khung chuẩn miễn phí.';
      retryable = true;
    }

    if (wantsStream && res.headersSent) {
      sendSse('error', { error: friendly, status: httpStatus, retryable, details: attemptErrors });
      return res.end();
    }

    return res.status(httpStatus).json({ error: friendly, retryable, details: attemptErrors });
  }
});

// 3. Episodes persistence endpoints
app.get('/api/episodes', (req, res) => {
  const episodes = loadEpisodes();
  res.json(episodes);
});

app.get('/api/episodes/:id', (req, res) => {
  const episodes = loadEpisodes();
  const episode = episodes.find((e: any) => e.id === req.params.id);
  if (!episode) {
    return res.status(404).json({ error: 'Không tìm thấy số phát sóng này.' });
  }
  res.json(episode);
});

app.post('/api/episodes', (req, res) => {
  try {
    const episodeData = req.body;
    if (!episodeData.id) {
      episodeData.id = `ep-${Date.now()}`;
    }
    episodeData.updatedAt = new Date().toISOString();

    const episodes = loadEpisodes();
    const index = episodes.findIndex((e: any) => e.id === episodeData.id);

    if (index >= 0) {
      episodes[index] = { ...episodes[index], ...episodeData };
    } else {
      episodes.unshift(episodeData);
    }

    saveEpisodes(episodes);
    res.json({ success: true, episode: episodeData });
  } catch (error: any) {
    console.error('Error saving episode:', error);
    res.status(500).json({ error: 'Không thể lưu bài phát thanh.' });
  }
});

app.delete('/api/episodes/:id', (req, res) => {
  try {
    let episodes = loadEpisodes();
    episodes = episodes.filter((e: any) => e.id !== req.params.id);
    saveEpisodes(episodes);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Không thể xóa bài phát thanh.' });
  }
});

// Ensure unmatched /api/* routes and /api errors always return JSON (never HTML)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint không tồn tại.' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    console.error('API middleware error:', err);
    return res.status(err.status || 500).json({
      error: err.message || 'Lỗi xử lý yêu cầu trên máy chủ.',
    });
  }
  return next(err);
});

// Vite middleware or static serving
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Radio server running at http://localhost:${PORT}`);
  });
}

startServer();

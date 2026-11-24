export interface VocabWord {
  id: string;
  english: string;
  vietnamese: string;
  phonetic: string;
  exampleEn: string;
  exampleVi: string;
  icon: string;
  imageUrl?: string;
  audioUrl?: string; // Pre-synthesized or generated WAV base64/URL
}

export interface SentencePattern {
  questionEn: string;
  questionVi: string;
  answerPatternEn: string; // e.g. "It's a [từ vựng]."
  answerExampleEn: string; // e.g. "It's a pen."
  answerExampleVi: string; // e.g. "Đó là một chiếc bút mực."
  guideVi: string; // e.g. "Dùng để hỏi và trả lời đồ vật là gì"
}

export interface Topic {
  id: string;
  titleVi: string;
  titleEn: string;
  icon: string;
  descriptionVi: string;
  words: VocabWord[];
  sentencePattern: SentencePattern;
}

export type SpeakerRole = 'mc_vietnamese' | 'mc_english' | 'student' | 'sfx' | 'silence';

export interface ScriptSegment {
  id: string;
  part: number; // 1 to 6
  partNameVi: string;
  speaker: SpeakerRole;
  speakerName: string; // 'Cô Mai (Việt Nam)', 'Thầy David (Mỹ)', etc.
  textVi?: string; // Translation or guidance in Vietnamese
  textEn?: string; // Spoken text in English or Vietnamese
  spokenText: string; // The exact text spoken by the TTS
  language: 'vi' | 'en';
  silenceSecondsAfter?: number; // 3-4s for words, 4-5s for questions
  audioUrl?: string; // base64 WAV or audio URL
  isSynthesizing?: boolean;
  synthesized?: boolean;
  error?: string;
  startSeconds?: number; // Exact timestamp where this segment begins in the audio
  endSeconds?: number; // Exact timestamp where this segment ends in the audio
  durationSeconds?: number; // Duration of this segment's speech
}

export interface RadioEpisode {
  id: string;
  title: string;
  topicId: string;
  topicTitleVi: string;
  topicTitleEn: string;
  targetWords: VocabWord[];
  durationMinutes: 5 | 7;
  voiceVi: string; // e.g., 'Kore' or 'Aoede'
  voiceEn: string; // e.g., 'Puck' or 'Zephyr'
  bgmType: 'gentle_acoustic' | 'happy_playful' | 'none';
  bgmVolume: number; // 0.1 to 0.3
  segments: ScriptSegment[];
  published: boolean;
  createdAt: string;
  fullAudioUrl?: string; // Full mixed WAV URL or base64
  fullAudioBlobKey?: string;
  sentencePattern?: SentencePattern;
  notesVi?: string;
}

export interface QuizQuestion {
  id: string;
  questionVi: string;
  audioPromptEn?: string;
  options: {
    text: string;
    isCorrect: boolean;
    icon?: string;
  }[];
  explanationVi: string;
}

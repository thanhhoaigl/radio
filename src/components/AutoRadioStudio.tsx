import React, { useState } from 'react';
import { 
  Sparkles, Clock, Volume2, Music, Download, CheckCircle2, 
  RotateCcw, Play, Pause, Save, Share2, AlertCircle, Edit3, 
  Plus, Trash2, ArrowRight, ArrowLeft, Radio, Layers
} from 'lucide-react';
import { Topic, VocabWord, ScriptSegment, RadioEpisode } from '../types/radio';
import { PRELOADED_TOPICS } from '../data/topics';
import { DEMO_EPISODE } from '../data/demoEpisode';
import { 
  concatenateWavBuffers, createSilenceWavBlob, base64ToArrayBuffer, 
  createSectionTransitionWavBlob, createRepeatPromptWavBlob,
  startBackgroundMusic, stopBackgroundMusic, SoundFX 
} from '../utils/audioSynthesizer';
import { fetchJson, fetchSseResult } from '../utils/apiClient';

interface AutoRadioStudioProps {
  onEpisodePublished: (episode: RadioEpisode) => void;
  onOpenShareModal: () => void;
}

export const AutoRadioStudio: React.FC<AutoRadioStudioProps> = ({ 
  onEpisodePublished, 
  onOpenShareModal 
}) => {
  // Current wizard step: 1 (Topic & Words) -> 2 (Config) -> 3 (Script & Edit) -> 4 (Speech Gen) -> 5 (Master & Export)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Selected topic and words
  const [selectedTopic, setSelectedTopic] = useState<Topic>(PRELOADED_TOPICS[0]);
  const [wordCountChoice, setWordCountChoice] = useState<3 | 5>(3);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>(
    PRELOADED_TOPICS[0].words.slice(0, 3).map((w) => w.id)
  );

  // Program duration & fixed signature voices
  const [durationMinutes, setDurationMinutes] = useState<5 | 7>(5);
  const voiceVi = 'Kore'; // Fixed Southern Vietnamese teacher voice matching Góc Học Sinh (Cô Mai)
  const voiceEn = 'Puck'; // Fixed native US English teacher voice matching Góc Học Sinh (Thầy David)
  const [bgmType, setBgmType] = useState<'happy_playful' | 'gentle_acoustic' | 'none'>('happy_playful');
  const [bgmVolume, setBgmVolume] = useState<number>(0.15);

  // Script & Generation state
  const [segments, setSegments] = useState<ScriptSegment[]>(DEMO_EPISODE.segments);
  const [episodeTitle, setEpisodeTitle] = useState<string>(DEMO_EPISODE.title);
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [scriptGenStatus, setScriptGenStatus] = useState<string>('Đang Viết Kịch Bản Radio AI...');
  const [scriptGenError, setScriptGenError] = useState<string | null>(null);

  // TTS Speech Generation state
  const [isBatchSynthesizing, setIsBatchSynthesizing] = useState<boolean>(false);
  const [synthesizeProgress, setSynthesizeProgress] = useState<number>(0);
  const [currentlySynthesizingIndex, setCurrentlySynthesizingIndex] = useState<number | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);

  // Audio Playback state
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const activeAudioRef = React.useRef<HTMLAudioElement | null>(null);

  // Master Full WAV Audio state
  const [isCompilingMaster, setIsCompilingMaster] = useState<boolean>(false);
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishedSuccess, setPublishedSuccess] = useState<boolean>(false);
  const [studioNotice, setStudioNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setStudioNotice(msg);
    setTimeout(() => setStudioNotice(null), 3500);
  };

  // Handle changing topic
  const handleSelectTopic = (topic: Topic) => {
    setSelectedTopic(topic);
    const initialWords = topic.words.slice(0, wordCountChoice).map((w) => w.id);
    setSelectedWordIds(initialWords);
  };

  // Toggle word selection
  const handleToggleWord = (wordId: string) => {
    if (selectedWordIds.includes(wordId)) {
      if (selectedWordIds.length <= 3) {
        showNotice('Cần chọn tối thiểu 3 từ vựng cho một bài phát thanh hiệu quả.');
        return;
      }
      setSelectedWordIds(selectedWordIds.filter((id) => id !== wordId));
    } else {
      if (selectedWordIds.length >= 5) {
        showNotice('Tối đa 5 từ vựng để học sinh vùng cao không bị quá tải kiến thức.');
        return;
      }
      setSelectedWordIds([...selectedWordIds, wordId]);
    }
  };

  // Generate Script with Gemini (SSE streaming to avoid proxy timeouts)
  const handleGenerateScript = async () => {
    setIsGeneratingScript(true);
    setScriptGenError(null);
    setScriptGenStatus('Đang kết nối AI viết kịch bản song ngữ...');

    const targetWords = selectedTopic.words.filter((w) => selectedWordIds.includes(w.id));

    try {
      const data = await fetchSseResult<{ segments: ScriptSegment[]; title?: string }>(
        '/api/generate-script',
        {
          topicTitleVi: selectedTopic.titleVi,
          topicTitleEn: selectedTopic.titleEn,
          targetWords,
          durationMinutes,
          sentencePattern: selectedTopic.sentencePattern,
        },
        (statusMsg) => setScriptGenStatus(statusMsg)
      );

      setSegments(data.segments);
      if (data.title) setEpisodeTitle(data.title);
      setCurrentStep(3); // Go to edit step
    } catch (err: any) {
      setScriptGenError(err.message || 'Không thể kết nối đến máy chủ AI.');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Explicit teacher-triggered 6-part bilingual template builder (rich & expressive offline fallback)
  const handleBuildTemplateScript = () => {
    const words = selectedTopic.words.filter((w) => selectedWordIds.includes(w.id));
    const pattern = selectedTopic.sentencePattern;
    const now = Date.now();
    const built: ScriptSegment[] = [];
    let idx = 0;
    const pushSeg = (seg: Omit<ScriptSegment, 'id'>) => {
      built.push({ ...seg, id: `tpl-${now}-${idx++}` });
    };

    const openingText = `Xin chào các bạn nhỏ đáng yêu! Ngoài khung cửa sổ lớp học, nắng sớm đang khẽ nhảy múa trên những tán cây xanh mát, và làn sóng ấm áp của Happy English Radio lại tìm về bên các em rồi đây! Hôm nay, chúng mình sẽ cùng nhau mở cánh cửa khám phá chủ đề "${selectedTopic.titleVi}" nhé.`;

    // Part 1: Welcome
    pushSeg({
      part: 1,
      partNameVi: 'Phần 1: Chào mừng (Welcome)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText: openingText,
      textVi: `Lời chào mở đầu giàu cảm xúc về chủ đề ${selectedTopic.titleVi}.`,
      language: 'vi',
      silenceSecondsAfter: 1,
    });
    pushSeg({
      part: 1,
      partNameVi: 'Phần 1: Chào mừng (Welcome)',
      speaker: 'mc_english',
      speakerName: 'Thầy David (Mỹ)',
      spokenText: `Good morning, Cô Mai! Hello, my wonderful little friends! Welcome to Happy English Radio! Today's topic is ${selectedTopic.titleEn}. Are you ready to smile and speak with us?`,
      textVi: `Chào buổi sáng Cô Mai! Xin chào các bạn nhỏ tuyệt vời! Chủ đề hôm nay là ${selectedTopic.titleEn}. Các em đã sẵn sàng mỉm cười và nói tiếng Anh cùng thầy cô chưa?`,
      language: 'en',
      silenceSecondsAfter: 2,
    });
    pushSeg({
      part: 1,
      partNameVi: 'Phần 1: Chào mừng (Welcome)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText: `Trong buổi phát thanh hôm nay, chỉ với ${words.length} từ khóa thật gần gũi và một mẫu câu giao tiếp xinh xắn, các em sẽ thấy tiếng Anh thật dễ thương như lời hát mỗi ngày đến lớp vậy. Nào, chúng mình cùng bước vào phần học từ mới nhé!`,
      textVi: `Giới thiệu hành trình khám phá ${words.length} từ khóa.`,
      language: 'vi',
      silenceSecondsAfter: 1,
    });

    // Part 2: Vocabulary & Pattern (rich storytelling per word)
    const wordLeadIns = [
      (w: VocabWord) =>
        `Mở đầu hành trình hôm nay là một từ vựng rất thân quen trong cuộc sống quanh em: "${w.vietnamese}". Nghe thật gần gũi phải không nào? Bây giờ, cả lớp hãy lắng nghe thật kỹ giọng đọc chuẩn bản ngữ của thầy David nhé!`,
      (w: VocabWord) =>
        `Tiếp nối niềm vui ấy, cô Mai muốn bật mí với các em một hình ảnh thật đẹp mang tên "${w.vietnamese}". Khi nhắc tới "${w.vietnamese}", các em nhớ ngay đến điều gì nhỉ? Cùng nghe xem trong tiếng Anh, từ này vang lên êm tai như thế nào nhé!`,
      (w: VocabWord) =>
        `Còn bây giờ là một người bạn từ vựng thứ ba vô cùng đáng yêu: "${w.vietnamese}". Mỗi lần dùng đúng từ này, câu nói của các em sẽ trở nên tự tin và rạng rỡ hơn rất nhiều đấy! Thầy David ơi, mời thầy đọc mẫu cho cả lớp nào!`,
      (w: VocabWord) =>
        `Chúng mình đang học rất chăm chú rồi! Từ khóa tiếp theo cũng gắn bó với mái trường và gia đình của các em mỗi ngày, đó chính là "${w.vietnamese}". Hãy mở rộng đôi tai để đón nhận âm thanh từ thầy David nhé!`,
      (w: VocabWord) =>
        `Và mảnh ghép cuối cùng trong bức tranh từ vựng hôm nay mang tên "${w.vietnamese}". Một từ nhỏ thôi nhưng sẽ giúp các em kể được thật nhiều câu chuyện hay bằng tiếng Anh đấy!`,
    ];

    words.forEach((w, i) => {
      const leadFn = wordLeadIns[i % wordLeadIns.length];
      pushSeg({
        part: 2,
        partNameVi: 'Phần 2: Học từ vựng & Mẫu câu (Vocabulary & Pattern)',
        speaker: 'mc_vietnamese',
        speakerName: 'Cô Mai (Việt Nam)',
        spokenText: leadFn(w),
        textVi: `Dẫn dắt gợi hình ảnh cho từ "${w.english}" (${w.vietnamese}).`,
        language: 'vi',
        silenceSecondsAfter: 1,
      });
      pushSeg({
        part: 2,
        partNameVi: 'Phần 2: Học từ vựng & Mẫu câu (Vocabulary & Pattern)',
        speaker: 'mc_english',
        speakerName: 'Thầy David (Mỹ)',
        spokenText: `${w.english}.`,
        textVi: `Phát âm chuẩn từ "${w.english}" (${w.vietnamese}) lần 1.`,
        language: 'en',
        silenceSecondsAfter: 2,
      });
      pushSeg({
        part: 2,
        partNameVi: 'Phần 2: Học từ vựng & Mẫu câu (Vocabulary & Pattern)',
        speaker: 'mc_english',
        speakerName: 'Thầy David (Mỹ)',
        spokenText: `${w.english}! ${w.exampleEn || w.english} Listen and repeat: ${w.english}!`,
        textVi: `${w.english} — Ví dụ: ${w.exampleEn || w.english} (${w.exampleVi || w.vietnamese}).`,
        language: 'en',
        silenceSecondsAfter: 3,
      });
      pushSeg({
        part: 2,
        partNameVi: 'Phần 2: Học từ vựng & Mẫu câu (Vocabulary & Pattern)',
        speaker: 'mc_vietnamese',
        speakerName: 'Cô Mai (Việt Nam)',
        spokenText: `Tuyệt vời quá! Thầy David vừa đọc mẫu "${w.english}" kèm câu ví dụ "${w.exampleVi || w.vietnamese}". Các em hãy nhớ ngay hình ảnh ấy để mỗi khi bắt gặp trong đời thực là mình bật ra tiếng Anh thật tự nhiên nhé!`,
        textVi: `Củng cố nghĩa và ngữ cảnh dùng từ "${w.english}".`,
        language: 'vi',
        silenceSecondsAfter: 2,
      });
    });

    if (pattern) {
      pushSeg({
        part: 2,
        partNameVi: 'Phần 2: Học từ vựng & Mẫu câu (Vocabulary & Pattern)',
        speaker: 'mc_vietnamese',
        speakerName: 'Cô Mai (Việt Nam)',
        spokenText: `Các em vừa bỏ túi được ${words.length} từ vựng thật hay rồi! Nhưng học một từ riêng lẻ thôi chưa đủ, mình hãy ghép chúng thành một câu giao tiếp hoàn chỉnh để trò chuyện với bạn bè nhé! Hôm nay, câu hỏi của chúng mình có nghĩa là: "${pattern.questionVi}". Hãy lắng nghe cô và thầy David trò chuyện làm mẫu nào!`,
        textVi: pattern.guideVi,
        language: 'vi',
        silenceSecondsAfter: 1,
      });
      pushSeg({
        part: 2,
        partNameVi: 'Phần 2: Học từ vựng & Mẫu câu (Vocabulary & Pattern)',
        speaker: 'mc_english',
        speakerName: 'Thầy David (Mỹ)',
        spokenText: `${pattern.questionEn} ${pattern.answerExampleEn} Let's try together! ${pattern.answerExampleEn}`,
        textVi: `Mẫu câu hỏi và trả lời: ${pattern.questionVi} → ${pattern.answerExampleVi}`,
        language: 'en',
        silenceSecondsAfter: 3,
      });
      pushSeg({
        part: 2,
        partNameVi: 'Phần 2: Học từ vựng & Mẫu câu (Vocabulary & Pattern)',
        speaker: 'mc_vietnamese',
        speakerName: 'Cô Mai (Việt Nam)',
        spokenText: `Nghe thật nhịp nhàng và tự nhiên đúng không các em? Chỉ cần thay các từ mới vừa học vào mẫu câu "${pattern.answerPatternEn || pattern.answerExampleEn}" là các em đã có thể tự tin nói thành câu dài rồi đấy!`,
        textVi: 'Khích lệ học sinh ghép từ vào mẫu câu.',
        language: 'vi',
        silenceSecondsAfter: 2,
      });
    }

    // Part 3: Listen and Guess (2 riddles for 5m, 3 riddles for 7m)
    pushSeg({
      part: 3,
      partNameVi: 'Phần 3: Nghe và Đoán (Listen and Guess)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText: `Bây giờ, cả lớp cùng bước vào khu vườn trò chơi "Nghe và Đoán"! Cô Mai sẽ kể một vài tình huống nhỏ thật vui, và nhiệm vụ của các em là lắng nghe thật tinh để gọi đúng tên từ tiếng Anh trong vòng 4 giây suy nghĩ nhé!`,
      textVi: 'Mở đầu phần trò chơi Nghe và Đoán.',
      language: 'vi',
      silenceSecondsAfter: 1,
    });

    const quizTargetCount = durationMinutes >= 7 && words.length >= 3 ? 3 : Math.min(2, words.length);
    for (let q = 0; q < quizTargetCount; q++) {
      const qw = words[q];
      pushSeg({
        part: 3,
        partNameVi: 'Phần 3: Nghe và Đoán (Listen and Guess)',
        speaker: 'mc_vietnamese',
        speakerName: 'Cô Mai (Việt Nam)',
        spokenText:
          q === 0
            ? `Câu đố đầu tiên dành cho đôi tai tinh nhanh của các bạn nhỏ: Khi trong lòng muốn nhắc đến "${qw.vietnamese}" — giống như trong câu "${qw.exampleVi || qw.vietnamese}" — em sẽ nói từ tiếng Anh nào thật to nhỉ? Bốn giây suy nghĩ bắt đầu!`
            : q === 1
            ? `Ồ, cả lớp trả lời nhanh quá! Tiếp theo là câu đố thứ hai: Nếu thầy David mỉm cười hỏi em về "${qw.vietnamese}", từ tiếng Anh nào sẽ vang lên trên môi các em đây? Hãy nói thật to đáp án của mình nào!`
            : `Thử thách tăng tốc câu đố số ba nhé! Từ tiếng Anh nào mang ý nghĩa "${qw.vietnamese}" mà chúng mình vừa cùng nhau khám phá ở đầu giờ nhỉ? Nào, ba, hai, một...`,
        textVi: `Câu đố tình huống ${q + 1} cho từ "${qw.english}".`,
        language: 'vi',
        silenceSecondsAfter: 4,
      });
      pushSeg({
        part: 3,
        partNameVi: 'Phần 3: Nghe và Đoán (Listen and Guess)',
        speaker: 'mc_english',
        speakerName: 'Thầy David (Mỹ)',
        spokenText:
          q === 0
            ? `Bravo! The answer is ${qw.english}! You are so clever!`
            : `Wonderful job! Yes, it is ${qw.english}! Keep smiling!`,
        textVi: `Đáp án đúng là ${qw.english} (${qw.vietnamese})!`,
        language: 'en',
        silenceSecondsAfter: 2,
      });
    }

    pushSeg({
      part: 3,
      partNameVi: 'Phần 3: Nghe và Đoán (Listen and Guess)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText: `Hoan hô cả lớp! Những cánh tay giơ lên và giọng trả lời đồng thanh thật làm cô Mai và thầy David ấm lòng. Bây giờ chúng mình cùng bước sang phần luyện phát âm chuẩn nhé!`,
      textVi: 'Khen ngợi và chuyển tiếp sang Phần 4.',
      language: 'vi',
      silenceSecondsAfter: 1,
    });

    // Part 4: Listen and Repeat (strict rules: ONLY the word, 5s silence)
    pushSeg({
      part: 4,
      partNameVi: 'Phần 4: Nghe và Nhắc lại (Listen and Repeat)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText:
        'Đã đến giờ vàng "Nghe và Nhắc lại" rồi! Các em hãy ngồi thẳng lưng, hít một hơi thật sâu để lấy hơi thật khỏe nhé. Sau mỗi tiếng đọc của thầy David và tiếng chuông nhỏ, cả lớp hãy đồng thanh nhắc lại thật to, thật tròn âm nào!',
      textVi: 'Hướng dẫn học sinh luyện phát âm chuẩn.',
      language: 'vi',
      silenceSecondsAfter: 2,
    });
    words.forEach((w) => {
      pushSeg({
        part: 4,
        partNameVi: 'Phần 4: Nghe và Nhắc lại (Listen and Repeat)',
        speaker: 'mc_english',
        speakerName: 'Thầy David (Mỹ)',
        spokenText: `${w.english}.`,
        textVi: `Phát âm chuẩn từ ${w.english} (${w.vietnamese}) — Khoảng lặng 5 giây để học sinh nhắc lại.`,
        language: 'en',
        silenceSecondsAfter: 5,
      });
    });
    pushSeg({
      part: 4,
      partNameVi: 'Phần 4: Nghe và Nhắc lại (Listen and Repeat)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText:
        'Âm thanh vang vọng khắp phòng học nghe thật trong trẻo và tự tin! Các em đã phát âm chuẩn hơn rất nhiều rồi đấy!',
      textVi: 'Khen ngợi học sinh sau phần luyện nhắc lại.',
      language: 'vi',
      silenceSecondsAfter: 1,
    });

    // Part 5: Mini Challenge
    const challengeWord = words[1] || words[0];
    const extraChallengeWord = words[2] || words[0];
    pushSeg({
      part: 5,
      partNameVi: 'Phần 5: Thử thách nhỏ (Mini Challenge)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText: pattern
        ? `Chào mừng các em đến với "Thử thách nhỏ" ngày hôm nay! Hai bạn ngồi cạnh nhau hãy quay sang mỉm cười thật tươi với bạn mình: một bạn đóng vai người hỏi "${pattern.questionEn}", còn bạn kia hãy khéo léo dùng từ "${challengeWord.vietnamese}" để đáp lại bằng tiếng Anh nhé! Năm giây thực hành bắt đầu!`
        : `Đến phần "Thử thách nhỏ" rồi! Hai bạn ngồi cạnh nhau hãy quay sang bắt tay thân ái, chọn một từ tiếng Anh mình thích nhất hôm nay và nói thật to cho bạn nghe nhé!`,
      textVi: 'Hoạt động đối đáp theo cặp tại lớp học.',
      language: 'vi',
      silenceSecondsAfter: 5,
    });
    pushSeg({
      part: 5,
      partNameVi: 'Phần 5: Thử thách nhỏ (Mini Challenge)',
      speaker: 'mc_english',
      speakerName: 'Thầy David (Mỹ)',
      spokenText: pattern
        ? `High five, my friends! ${pattern.questionEn} ${pattern.answerExampleEn} You sound amazing!`
        : `High five, my friends! Your English sounds amazing today!`,
      textVi: 'Đập tay ăn mừng! Các em nói tiếng Anh thật tuyệt vời!',
      language: 'en',
      silenceSecondsAfter: 2,
    });

    if (durationMinutes >= 7) {
      pushSeg({
        part: 5,
        partNameVi: 'Phần 5: Thử thách nhỏ (Mini Challenge)',
        speaker: 'mc_vietnamese',
        speakerName: 'Cô Mai (Việt Nam)',
        spokenText: `Thầy David khen chúng mình quá trời kìa! Bây giờ đổi vai lại nhé: bạn lúc nãy trả lời sẽ chuyển sang hỏi, còn bạn kia hãy thử ghép từ "${extraChallengeWord.vietnamese}" vào câu nói của mình xem sao nào!`,
        textVi: 'Đổi vai thực hành lần 2 cho chương trình 7 phút.',
        language: 'vi',
        silenceSecondsAfter: 5,
      });
      pushSeg({
        part: 5,
        partNameVi: 'Phần 5: Thử thách nhỏ (Mini Challenge)',
        speaker: 'mc_english',
        speakerName: 'Thầy David (Mỹ)',
        spokenText: `Fantastic teamwork! Give yourselves a big round of applause!`,
        textVi: 'Phối hợp nhóm rất xuất sắc! Hãy tự thưởng một tràng pháo tay nào!',
        language: 'en',
        silenceSecondsAfter: 2,
      });
    }

    // Part 6: Review & Goodbye
    pushSeg({
      part: 6,
      partNameVi: 'Phần 6: Ôn tập và Tạm biệt (Review and Goodbye)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText: `Thời gian bên nhau trôi qua thật nhanh phải không các em? Hôm nay trong chủ đề "${selectedTopic.titleVi}", khu vườn tiếng Anh của chúng mình đã đón thêm ${words.length} bông hoa từ vựng rực rỡ: ${words
        .map((w) => `${w.english} là ${w.vietnamese}`)
        .join('; ')}. Chiều nay khi tan học trở về mái nhà thân thương, cô Mai giao cho mỗi bạn một nhiệm vụ nhỏ đáng yêu: hãy nói thật to một từ tiếng Anh mình yêu thích nhất cho bố mẹ, ông bà hoặc một người bạn cùng nghe nhé!`,
      textVi: 'Tổng kết bài học và giao nhiệm vụ thực hành trong ngày.',
      language: 'vi',
      silenceSecondsAfter: 2,
    });
    pushSeg({
      part: 6,
      partNameVi: 'Phần 6: Ôn tập và Tạm biệt (Review and Goodbye)',
      speaker: 'mc_english',
      speakerName: 'Thầy David (Mỹ)',
      spokenText:
        'You did a wonderful job today, dear students! Thank you for learning and smiling with us. Goodbye, and see you in the next episode!',
      textVi: 'Hôm nay các em đã học rất xuất sắc! Cảm ơn các em đã đồng hành cùng thầy cô. Tạm biệt và hẹn gặp lại!',
      language: 'en',
      silenceSecondsAfter: 1,
    });
    pushSeg({
      part: 6,
      partNameVi: 'Phần 6: Ôn tập và Tạm biệt (Review and Goodbye)',
      speaker: 'mc_vietnamese',
      speakerName: 'Cô Mai (Việt Nam)',
      spokenText:
        'Tạm biệt các em nhỏ thân yêu! Chúc các em có một ngày học tập thật nhiều tiếng cười, luôn chăm ngoan và tỏa sáng như những ngôi sao nhỏ trên bầu trời nhé. Hẹn gặp lại trên làn sóng Happy English Radio!',
      textVi: 'Lời chào kết ấm áp khép lại buổi phát thanh.',
      language: 'vi',
      silenceSecondsAfter: 1,
    });

    setSegments(built);
    setEpisodeTitle(`Số phát thanh: ${selectedTopic.titleVi} - Happy English Radio`);
    setScriptGenError(null);
    setCurrentStep(3);
    showNotice(`Đã tạo kịch bản song ngữ ${built.length} phân đoạn giàu cảm xúc từ khung chuẩn!`);
  };

  // Edit segment text inline
  const handleSegmentTextChange = (index: number, newText: string) => {
    const updated = [...segments];
    updated[index] = { ...updated[index], spokenText: newText, audioUrl: undefined, synthesized: false };
    setSegments(updated);
  };

  // Edit silence seconds
  const handleSilenceChange = (index: number, seconds: number) => {
    const updated = [...segments];
    updated[index] = { ...updated[index], silenceSecondsAfter: seconds };
    setSegments(updated);
  };

  // Add a custom segment to the script
  const handleAddSegment = (language: 'vi' | 'en') => {
    const lastSeg = segments[segments.length - 1];
    const part = lastSeg?.part || 6;
    const partNameVi = lastSeg?.partNameVi || 'Phần 6: Ôn tập và Tạm biệt (Review and Goodbye)';
    const newSeg: ScriptSegment = {
      id: `custom-${Date.now()}`,
      part,
      partNameVi,
      speaker: language === 'en' ? 'mc_english' : 'mc_vietnamese',
      speakerName: language === 'en' ? 'Thầy David (Mỹ)' : 'Cô Mai (Việt Nam)',
      spokenText:
        language === 'en'
          ? 'Great job, everyone! Keep practicing!'
          : 'Các em làm tốt lắm! Hãy cùng nhắc lại thật to một lần nữa nhé!',
      textVi: language === 'en' ? 'Đoạn thoại bổ sung của giáo viên.' : '',
      language,
      silenceSecondsAfter: 2,
    };
    setSegments([...segments, newSeg]);
  };

  // Delete a segment from the script
  const handleDeleteSegment = (index: number) => {
    if (segments.length <= 1) {
      showNotice('Kịch bản cần có ít nhất 1 phân đoạn.');
      return;
    }
    setSegments(segments.filter((_, idx) => idx !== index));
  };

  // Synthesize single segment TTS
  const handleSynthesizeSegment = async (index: number) => {
    const seg = segments[index];
    setCurrentlySynthesizingIndex(index);
    setTtsError(null);

    try {
      const data = await fetchJson<{ audioBase64: string }>('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: seg.spokenText,
          voice: seg.language === 'vi' ? voiceVi : voiceEn,
          language: seg.language,
        }),
      });

      const updated = [...segments];
      updated[index] = {
        ...updated[index],
        audioUrl: `data:audio/wav;base64,${data.audioBase64}`,
        synthesized: true,
      };
      setSegments(updated);
    } catch (err: any) {
      setTtsError(`Lỗi ở đoạn ${index + 1}: ${err.message}`);
    } finally {
      setCurrentlySynthesizingIndex(null);
    }
  };

  // Batch synthesize all segments
  const handleBatchSynthesizeAll = async () => {
    setIsBatchSynthesizing(true);
    setTtsError(null);
    setSynthesizeProgress(0);

    const updated = [...segments];
    for (let i = 0; i < updated.length; i++) {
      setCurrentlySynthesizingIndex(i);
      setSynthesizeProgress(Math.round(((i) / updated.length) * 100));

      // Skip already synthesized unless missing audioUrl
      if (updated[i].audioUrl && updated[i].synthesized) {
        continue;
      }

      try {
        const data = await fetchJson<{ audioBase64: string }>('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: updated[i].spokenText,
            voice: updated[i].language === 'vi' ? voiceVi : voiceEn,
            language: updated[i].language,
          }),
        });

        updated[i] = {
          ...updated[i],
          audioUrl: `data:audio/wav;base64,${data.audioBase64}`,
          synthesized: true,
        };
        setSegments([...updated]);
      } catch (err: any) {
        setTtsError(`Dừng tại đoạn ${i + 1}: ${err.message}`);
        setIsBatchSynthesizing(false);
        setCurrentlySynthesizingIndex(null);
        return;
      }
    }

    setSynthesizeProgress(100);
    setIsBatchSynthesizing(false);
    setCurrentlySynthesizingIndex(null);
    SoundFX.playCorrect();
  };

  // Play single segment audio
  const handlePlaySegmentAudio = (seg: ScriptSegment) => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    if (playingSegmentId === seg.id) {
      setPlayingSegmentId(null);
      return;
    }

    if (!seg.audioUrl) {
      showNotice('Đoạn này chưa được tạo âm thanh AI. Vui lòng bấm "Tạo âm thanh" trước.');
      return;
    }

    const audio = new Audio(seg.audioUrl);
    activeAudioRef.current = audio;
    setPlayingSegmentId(seg.id);

    audio.onended = () => {
      setPlayingSegmentId(null);
      activeAudioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingSegmentId(null);
      activeAudioRef.current = null;
    };
    audio.play();
  };

  // Compile Master Full WAV Program
  const handleCompileMasterWav = async () => {
    setIsCompilingMaster(true);
    try {
      const bufferList: ArrayBuffer[] = [];

      // Prepend cheerful radio intro startup jingle
      try {
        const jingleRes = await fetch('/audio/radio_intro_jingle.wav');
        if (jingleRes.ok) {
          const jingleBuf = await jingleRes.arrayBuffer();
          bufferList.push(jingleBuf);
          const pauseBlob = createSilenceWavBlob(0.8, 24000);
          bufferList.push(await pauseBlob.arrayBuffer());
        }
      } catch (jingleErr) {
        console.warn('Could not load intro jingle:', jingleErr);
      }

      let prevPart: number | null = null;
      const transitionBuf = await createSectionTransitionWavBlob(24000).arrayBuffer();
      const repeatPromptBuf = await createRepeatPromptWavBlob(24000).arrayBuffer();

      for (const seg of segments) {
        if (prevPart !== null && seg.part !== prevPart) {
          bufferList.push(transitionBuf);
        }
        prevPart = seg.part;

        if (seg.audioUrl) {
          let buf: ArrayBuffer;
          if (seg.audioUrl.startsWith('http') || seg.audioUrl.startsWith('/')) {
            const r = await fetch(seg.audioUrl);
            buf = await r.arrayBuffer();
          } else {
            buf = base64ToArrayBuffer(seg.audioUrl);
          }
          bufferList.push(buf);
        }

        // In Part 4 (Listen & Repeat), play a soft cue chime before the student repetition pause
        if (seg.part === 4 && seg.language === 'en') {
          bufferList.push(repeatPromptBuf);
        }

        // Insert real silence audio buffer
        const silenceSecs = seg.silenceSecondsAfter || 1;
        if (silenceSecs > 0) {
          const silenceBlob = createSilenceWavBlob(silenceSecs, 24000);
          const silenceArrayBuf = await silenceBlob.arrayBuffer();
          bufferList.push(silenceArrayBuf);
        }
      }

      if (bufferList.length === 0) {
        throw new Error('Chưa có đoạn âm thanh nào được tạo.');
      }

      const masterBlob = concatenateWavBuffers(bufferList, 24000);
      const masterUrl = URL.createObjectURL(masterBlob);
      setMasterAudioUrl(masterUrl);
      SoundFX.playApplause();
    } catch (err: any) {
      showNotice('Lỗi tạo tệp âm thanh hoàn chỉnh: ' + err.message);
    } finally {
      setIsCompilingMaster(false);
    }
  };

  // Save & Publish Episode
  const handlePublishEpisode = async () => {
    setIsPublishing(true);
    const targetWords = selectedTopic.words.filter((w) => selectedWordIds.includes(w.id));

    const newEpisode: RadioEpisode = {
      id: `ep-${Date.now()}`,
      title: episodeTitle,
      topicId: selectedTopic.id,
      topicTitleVi: selectedTopic.titleVi,
      topicTitleEn: selectedTopic.titleEn,
      targetWords,
      durationMinutes,
      voiceVi,
      voiceEn,
      bgmType,
      bgmVolume,
      sentencePattern: selectedTopic.sentencePattern,
      segments,
      published: true,
      createdAt: new Date().toISOString(),
      fullAudioUrl: masterAudioUrl || undefined,
      notesVi: `Phát sóng ${durationMinutes} phút về chủ đề ${selectedTopic.titleVi}.`,
    };

    try {
      await fetchJson('/api/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEpisode),
      });

      setPublishedSuccess(true);
      onEpisodePublished(newEpisode);
      SoundFX.playApplause();
    } catch (err: any) {
      showNotice('Không thể xuất bản bài phát thanh: ' + err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const targetWords = selectedTopic.words.filter((w) => selectedWordIds.includes(w.id));
  const allSynthesized = segments.every((s) => s.synthesized && s.audioUrl);

  return (
    <div className="space-y-6">
      {/* Inline studio notification banner */}
      {studioNotice && (
        <div className="p-3.5 bg-amber-500 text-white font-extrabold text-sm rounded-2xl shadow-md flex items-center justify-between animate-bounce">
          <span>🔔 {studioNotice}</span>
          <button onClick={() => setStudioNotice(null)} className="text-white hover:text-amber-100 font-black cursor-pointer">✕</button>
        </div>
      )}
      {/* Studio Header */}
      <div className="bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-600 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Chế độ A · Tự Động Tạo Đài Radio AI</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Sản Xuất Bản Tin Radio Tiếng Anh
            </h2>
            <p className="text-sm text-sky-100 max-w-2xl font-medium">
              Chỉ 3 bước đơn giản: Chọn 3–5 từ vựng → Tạo kịch bản song ngữ hấp dẫn → Tổng hợp giọng đọc AI chất lượng cao & Tải file âm thanh WAV hoàn chỉnh.
            </p>
          </div>

          {/* Quick Demo Loader */}
          <button
            onClick={() => {
              setSelectedTopic(PRELOADED_TOPICS[0]);
              setSegments(DEMO_EPISODE.segments);
              setEpisodeTitle(DEMO_EPISODE.title);
              setCurrentStep(3);
              SoundFX.playIntroJingle();
            }}
            className="self-start md:self-center px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-extrabold text-xs sm:text-sm rounded-2xl shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <span>Nạp Bản Mẫu "Chào Hỏi"</span>
            <Sparkles className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Steps Navigation Bar */}
        <div className="mt-6 pt-5 border-t border-white/20 flex items-center justify-between overflow-x-auto gap-2 text-xs font-extrabold">
          {[
            { step: 1, label: '1. Chủ đề & Từ vựng' },
            { step: 2, label: '2. Thời lượng & Giọng đọc' },
            { step: 3, label: '3. Kịch bản Radio' },
            { step: 4, label: '4. Giọng đọc AI & Khoảng lặng' },
            { step: 5, label: '5. Xuất bản & Tải về' },
          ].map((item) => (
            <button
              key={item.step}
              onClick={() => setCurrentStep(item.step)}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                currentStep === item.step
                  ? 'bg-white text-sky-900 shadow-sm'
                  : currentStep > item.step
                  ? 'bg-white/30 text-white hover:bg-white/40'
                  : 'text-sky-200 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- STEP 1: SELECT TOPIC & WORDS --- */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-800">Bước 1: Chọn Chủ Đề & 3–5 Từ Vựng Cốt Lõi</h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Nguyên tắc vàng: Ít từ - Dễ hiểu - Lặp lại nhiều lần để các em ghi nhớ tự nhiên.
              </p>
            </div>
            {/* Word count limit choice */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl self-start">
              <button
                onClick={() => {
                  setWordCountChoice(3);
                  setSelectedWordIds(selectedTopic.words.slice(0, 3).map((w) => w.id));
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                  wordCountChoice === 3 ? 'bg-sky-500 text-white shadow-xs' : 'text-slate-600'
                }`}
              >
                3 Từ Vựng (Khuyên dùng)
              </button>
              <button
                onClick={() => {
                  setWordCountChoice(5);
                  setSelectedWordIds(selectedTopic.words.slice(0, 5).map((w) => w.id));
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                  wordCountChoice === 5 ? 'bg-sky-500 text-white shadow-xs' : 'text-slate-600'
                }`}
              >
                5 Từ Vựng
              </button>
            </div>
          </div>

          {/* Topics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {PRELOADED_TOPICS.map((topic) => {
              const isSelected = selectedTopic.id === topic.id;
              return (
                <button
                  key={topic.id}
                  onClick={() => handleSelectTopic(topic)}
                  className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50/70 shadow-sm ring-2 ring-sky-200'
                      : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-3xl">{topic.icon}</span>
                  <div className="font-extrabold text-xs text-slate-800 line-clamp-1">{topic.titleVi}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{topic.titleEn}</div>
                </button>
              );
            })}
          </div>

          {/* Words selector for active topic */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-extrabold text-slate-700">
                Các từ được chọn cho bài phát thanh ({selectedWordIds.length}/{selectedTopic.words.length}):
              </h4>
              <span className="text-xs text-amber-700 font-bold">
                Bấm vào thẻ từ để bật / tắt lựa chọn
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {selectedTopic.words.map((word) => {
                const isChecked = selectedWordIds.includes(word.id);
                return (
                  <div
                    key={word.id}
                    onClick={() => handleToggleWord(word.id)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                      isChecked
                        ? 'bg-emerald-50/70 border-emerald-400 ring-1 ring-emerald-200'
                        : 'bg-slate-50/50 border-slate-200 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{word.icon}</span>
                      <div>
                        <div className="font-extrabold text-sm text-slate-800">{word.english}</div>
                        <div className="text-xs text-slate-500 font-medium">{word.vietnamese}</div>
                      </div>
                    </div>
                    <CheckCircle2
                      className={`w-5 h-5 shrink-0 ${
                        isChecked ? 'text-emerald-500 fill-emerald-100' : 'text-slate-300'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Target Sentence Pattern Display */}
          {selectedTopic.sentencePattern && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-md">
                    Mẫu câu trọng tâm của bài
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {selectedTopic.sentencePattern.guideVi}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base font-black text-slate-900 pt-1">
                  <span className="text-sky-700">❓ {selectedTopic.sentencePattern.questionEn}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-emerald-700">💬 {selectedTopic.sentencePattern.answerPatternEn}</span>
                  <span className="text-xs font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Ví dụ: {selectedTopic.sentencePattern.answerExampleEn}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-sm rounded-2xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Tiếp Tục: Chọn Thời Lượng & Giọng Đọc</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* --- STEP 2: DURATION & VOICE CONFIG --- */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div>
            <h3 className="text-xl font-black text-slate-800">Bước 2: Thời Lượng & Giọng Đọc AI Cao Cấp</h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Sử dụng mô hình Gemini Text-to-Speech chính thức để tạo ngữ điệu tự nhiên, ấm áp và chuẩn xác.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Duration Selector */}
            <div className="p-5 bg-sky-50/50 border border-sky-100 rounded-3xl space-y-3">
              <label className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-500" />
                <span>Thời Lượng Chương Trình:</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDurationMinutes(5)}
                  className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                    durationMinutes === 5
                      ? 'bg-white border-sky-500 shadow-sm ring-2 ring-sky-200'
                      : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}
                >
                  <div className="text-2xl font-black text-sky-600">5 Phút</div>
                  <div className="text-xs font-bold text-slate-600 mt-1">Phù hợp tiết chào cờ & 15 phút đầu giờ</div>
                </button>
                <button
                  onClick={() => setDurationMinutes(7)}
                  className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                    durationMinutes === 7
                      ? 'bg-white border-sky-500 shadow-sm ring-2 ring-sky-200'
                      : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}
                >
                  <div className="text-2xl font-black text-sky-600">7 Phút</div>
                  <div className="text-xs font-bold text-slate-600 mt-1">Có thêm phần trò chơi & thử thách nhỏ</div>
                </button>
              </div>
            </div>

            {/* Background Music Selector */}
            <div className="p-5 bg-amber-50/50 border border-amber-100 rounded-3xl space-y-3">
              <label className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Music className="w-4 h-4 text-amber-500" />
                <span>Nhạc Nền Êm Dịu (BGM):</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setBgmType('happy_playful')}
                  className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                    bgmType === 'happy_playful'
                      ? 'bg-white border-amber-500 shadow-sm ring-2 ring-amber-200'
                      : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}
                >
                  <div className="text-base font-black text-amber-800">Vui Tươi Rộn Rã</div>
                  <div className="text-xs font-medium text-slate-500 mt-0.5">Tiếng chuông & marimba nhẹ</div>
                </button>
                <button
                  onClick={() => setBgmType('gentle_acoustic')}
                  className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                    bgmType === 'gentle_acoustic'
                      ? 'bg-white border-amber-500 shadow-sm ring-2 ring-amber-200'
                      : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}
                >
                  <div className="text-base font-black text-amber-800">Dịu Nhẹ Ấm Áp</div>
                  <div className="text-xs font-medium text-slate-500 mt-0.5">Hộp âm nhạc du dương</div>
                </button>
              </div>
            </div>

            {/* Vietnamese Teacher Fixed Voice */}
            <div className="p-5 bg-pink-50/50 border border-pink-100 rounded-3xl space-y-3">
              <div className="text-sm font-extrabold text-slate-800 flex items-center justify-between">
                <span>Giọng Cô Giáo Việt Nam (MC Cô Mai):</span>
                <span className="text-xs font-bold text-pink-700">Đồng bộ Góc Học Sinh</span>
              </div>
              <div className="p-3.5 rounded-2xl border border-pink-400 bg-white shadow-sm ring-2 ring-pink-100 flex items-center justify-between gap-3">
                <div>
                  <div className="font-black text-sm text-pink-900">Cô Mai · Giọng Miền Nam (Cố định)</div>
                  <div className="text-xs text-slate-500 mt-0.5 font-medium">
                    Giọng nữ miền Nam ngọt ngào, ấm áp — giữ nguyên đồng nhất ở Góc Học Sinh, Phòng Thu Trực Tiếp và Tạo Đài Tự Động.
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-pink-500 shrink-0" />
              </div>
            </div>

            {/* English Native Teacher Fixed Voice */}
            <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-3xl space-y-3">
              <div className="text-sm font-extrabold text-slate-800 flex items-center justify-between">
                <span>Giọng Thầy Giáo Bản Ngữ Mỹ (Thầy David):</span>
                <span className="text-xs font-bold text-emerald-700">Đồng bộ Góc Học Sinh</span>
              </div>
              <div className="p-3.5 rounded-2xl border border-emerald-400 bg-white shadow-sm ring-2 ring-emerald-100 flex items-center justify-between gap-3">
                <div>
                  <div className="font-black text-sm text-emerald-900">Thầy David · Giọng Puck (Nam)</div>
                  <div className="text-xs text-slate-500 mt-0.5 font-medium">
                    Giọng thầy giáo ấm áp, chuẩn âm Mỹ — giữ nguyên đồng nhất ở Góc Học Sinh, Phòng Thu Trực Tiếp và Tạo Đài Tự Động.
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs sm:text-sm rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay Lại</span>
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleBuildTemplateScript}
                disabled={isGeneratingScript}
                className="px-5 py-3 bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold text-xs sm:text-sm rounded-2xl flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                title="Tạo ngay kịch bản 6 phần theo từ vựng và mẫu câu đã chọn mà không tốn lượt gọi AI"
              >
                <Edit3 className="w-4 h-4" />
                <span>Tạo Từ Khung Chuẩn (Offline)</span>
              </button>

              <button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript}
                className="px-7 py-3 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-black text-sm rounded-2xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isGeneratingScript ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin text-amber-300" />
                    <span>{scriptGenStatus}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Tạo Kịch Bản Song Ngữ (AI Miễn Phí)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {scriptGenError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scriptGenError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={handleGenerateScript}
                  disabled={isGeneratingScript}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Thử Lại Ngay</span>
                </button>
                <button
                  onClick={handleBuildTemplateScript}
                  disabled={isGeneratingScript}
                  className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Tạo Nhanh Từ Khung Chuẩn</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- STEP 3: SCRIPT REVIEW & INLINE EDITOR --- */}
      {currentStep === 3 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-800">Bước 3: Xem & Chỉnh Sửa Kịch Bản Phát Thanh</h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Kịch bản gồm đầy đủ 6 phần: Chào đầu, Giới thiệu từ vựng, Đố vui, Luyện phát âm, Thử thách và Kết thúc.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isGeneratingScript ? 'animate-spin' : ''}`} />
                <span>{isGeneratingScript ? 'Đang Tạo Lại...' : 'Tạo Lại Kịch Bản Khác'}</span>
              </button>
            </div>
          </div>

          {scriptGenError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scriptGenError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={handleGenerateScript}
                  disabled={isGeneratingScript}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Thử Lại Ngay</span>
                </button>
                <button
                  onClick={handleBuildTemplateScript}
                  disabled={isGeneratingScript}
                  className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Tạo Nhanh Từ Khung Chuẩn</span>
                </button>
              </div>
            </div>
          )}

          {/* Episode Title & Script Summary Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-7 bg-sky-50/50 p-4 rounded-2xl border border-sky-100">
              <label className="block text-xs font-bold text-sky-800 uppercase tracking-wider mb-1">
                Tiêu Đề Bản Tin Phát Thanh:
              </label>
              <input
                type="text"
                value={episodeTitle}
                onChange={(e) => setEpisodeTitle(e.target.value)}
                className="w-full bg-white px-3.5 py-2 border border-sky-200 rounded-xl text-sm font-extrabold text-slate-800 focus:outline-hidden"
              />
            </div>

            <div className="lg:col-span-5 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 flex items-center justify-around text-center">
              <div>
                <div className="text-lg font-black text-emerald-700">{segments.length}</div>
                <div className="text-[11px] font-bold text-slate-600">Phân đoạn</div>
              </div>
              <div className="h-8 w-px bg-emerald-200" />
              <div>
                <div className="text-lg font-black text-sky-700">
                  {segments.reduce((acc, s) => acc + s.spokenText.split(/\s+/).filter(Boolean).length, 0)}
                </div>
                <div className="text-[11px] font-bold text-slate-600">Tổng số từ</div>
              </div>
              <div className="h-8 w-px bg-emerald-200" />
              <div>
                <div className="text-lg font-black text-indigo-700">
                  ~{Math.max(1, Math.round(
                    segments.reduce((acc, s) => {
                      const wordsCount = s.spokenText.split(/\s+/).filter(Boolean).length;
                      const speechSecs = wordsCount / (s.language === 'vi' ? 2.6 : 2.1);
                      return acc + speechSecs + (s.silenceSecondsAfter || 0);
                    }, 12) / 60 * 10
                  ) / 10)} phút
                </div>
                <div className="text-[11px] font-bold text-slate-600">Thời lượng dự kiến</div>
              </div>
            </div>
          </div>

          {/* Script Segments Table / List */}
          <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1 scrollbar-thin">
            {segments.map((seg, idx) => {
              const isEnglish = seg.language === 'en';
              return (
                <div
                  key={seg.id || idx}
                  className={`p-4 rounded-2xl border transition-all ${
                    isEnglish
                      ? 'bg-emerald-50/30 border-emerald-200/80'
                      : 'bg-sky-50/30 border-sky-200/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                      <span
                        className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-lg ${
                          isEnglish
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {seg.speakerName}
                      </span>
                      <span className="text-xs font-bold text-slate-600">{seg.partNameVi}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Silence interval after input */}
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <span>Khoảng lặng sau câu:</span>
                        <input
                          type="number"
                          min="0"
                          max="8"
                          value={seg.silenceSecondsAfter || 1}
                          onChange={(e) => handleSilenceChange(idx, parseInt(e.target.value) || 0)}
                          className="w-12 px-2 py-0.5 bg-white border border-slate-300 rounded-md text-center font-bold"
                        />
                        <span>giây</span>
                      </div>

                      {segments.length > 1 && (
                        <button
                          onClick={() => handleDeleteSegment(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Xóa phân đoạn này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Spoken Text Edit Field */}
                  <textarea
                    rows={seg.spokenText.length > 140 ? 3 : 2}
                    value={seg.spokenText}
                    onChange={(e) => handleSegmentTextChange(idx, e.target.value)}
                    className="w-full bg-white p-2.5 border border-slate-200 rounded-xl text-sm font-bold leading-relaxed text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-300 resize-y"
                  />

                  {seg.textVi && isEnglish && (
                    <div className="text-xs font-semibold text-slate-500 mt-1">
                      💡 Nghĩa/Ghi chú: {seg.textVi}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add custom segment quick buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => handleAddSegment('vi')}
              className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Lời Cô Mai (Tiếng Việt)</span>
            </button>
            <button
              onClick={() => handleAddSegment('en')}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Lời Thầy David (Tiếng Anh)</span>
            </button>
          </div>

          {/* Navigation to Speech Gen Step */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs sm:text-sm rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay Lại</span>
            </button>

            <button
              onClick={() => setCurrentStep(4)}
              className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-black text-sm rounded-2xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Tiếp Tục: Tạo Giọng Đọc AI & Nghe Thử</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* --- STEP 4: SPEECH GENERATION & AUDIO PREVIEW --- */}
      {currentStep === 4 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-800">Bước 4: Tổng Hợp Giọng Đọc AI (Gemini TTS)</h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Tạo âm thanh từng phân đoạn bằng giọng chuẩn bản ngữ, chèn khoảng lặng thực tế để học sinh nhắc lại.
              </p>
            </div>

            {/* Batch Synthesize Button */}
            <button
              onClick={handleBatchSynthesizeAll}
              disabled={isBatchSynthesizing}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs sm:text-sm rounded-2xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isBatchSynthesizing ? (
                <>
                  <Volume2 className="w-4 h-4 animate-bounce" />
                  <span>Đang tạo âm thanh ({synthesizeProgress}%)...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Tự Động Tạo Tất Cả Âm Thanh</span>
                </>
              )}
            </button>
          </div>

          {/* Progress Bar */}
          {isBatchSynthesizing && (
            <div className="space-y-1.5">
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${synthesizeProgress}%` }}
                ></div>
              </div>
              <div className="text-xs font-bold text-slate-500 text-right">
                Đang xử lý phân đoạn #{currentlySynthesizingIndex !== null ? currentlySynthesizingIndex + 1 : 1}...
              </div>
            </div>
          )}

          {ttsError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{ttsError}</span>
              </div>
              <button
                onClick={handleBatchSynthesizeAll}
                disabled={isBatchSynthesizing}
                className="self-start sm:self-center px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tiếp Tục Tạo Phần Còn Lại</span>
              </button>
            </div>
          )}

          {/* Segment Audio Review List */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
            {segments.map((seg, idx) => {
              const isPlaying = playingSegmentId === seg.id;
              const isSynthesizingThis = currentlySynthesizingIndex === idx;
              const hasAudio = !!seg.audioUrl;

              return (
                <div
                  key={seg.id || idx}
                  className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    hasAudio
                      ? 'bg-slate-50/80 border-slate-200/90'
                      : 'bg-amber-50/30 border-amber-200/70'
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                      <span className="text-xs font-black uppercase text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {seg.speakerName}
                      </span>
                      <span className="text-xs font-bold text-slate-500">{seg.partNameVi}</span>
                      {hasAudio ? (
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                          ✓ Đã có âm thanh AI
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                          Chưa tạo
                        </span>
                      )}
                    </div>
                    <div className="font-extrabold text-slate-800 text-sm leading-snug">
                      {seg.spokenText}
                    </div>
                  </div>

                  {/* Play & Re-synthesize actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {hasAudio && (
                      <button
                        onClick={() => handlePlaySegmentAudio(seg)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                          isPlaying
                            ? 'bg-rose-500 text-white shadow-xs'
                            : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200'
                        }`}
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        <span>{isPlaying ? 'Dừng' : 'Nghe thử'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleSynthesizeSegment(idx)}
                      disabled={isSynthesizingThis || isBatchSynthesizing}
                      className="px-3.5 py-2 bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs rounded-xl flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSynthesizingThis ? (
                        <>
                          <Volume2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang tạo...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{hasAudio ? 'Tạo lại' : 'Tạo AI'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              onClick={() => setCurrentStep(3)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs sm:text-sm rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay Lại</span>
            </button>

            <button
              onClick={() => setCurrentStep(5)}
              className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-black text-sm rounded-2xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Tiếp Tục: Xuất Bản & Tải Về Tệp Âm Thanh</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* --- STEP 5: MASTER MIXER & EXPORT & PUBLISH --- */}
      {currentStep === 5 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div>
            <h3 className="text-xl font-black text-slate-800">Bước 5: Hoàn Tất, Tải Về & Xuất Bản Cho Lớp Học</h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Ghép toàn bộ lời dẫn, khoảng lặng nhịp điệu và nhạc nền thành một tệp âm thanh WAV chất lượng cao chuẩn phát thanh.
            </p>
          </div>

          {/* Master compilation card */}
          <div className="bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-sky-700 uppercase tracking-wider">
                  Chương trình hoàn chỉnh:
                </span>
                <h4 className="text-lg font-black text-slate-900">{episodeTitle}</h4>
                <div className="text-xs font-semibold text-slate-600">
                  Thời lượng dự kiến: {durationMinutes} phút · Số từ vựng: {targetWords.length} từ ({targetWords.map((w) => w.english).join(', ')})
                </div>
              </div>

              <button
                onClick={handleCompileMasterWav}
                disabled={isCompilingMaster}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm rounded-2xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isCompilingMaster ? (
                  <>
                    <Layers className="w-4 h-4 animate-spin text-amber-300" />
                    <span>Đang Ghép Tệp Âm Thanh...</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    <span>Tạo Tệp Âm Thanh Tổng Hợp (WAV)</span>
                  </>
                )}
              </button>
            </div>

            {/* Complete Audio Player */}
            {masterAudioUrl && (
              <div className="pt-4 border-t border-sky-200/60 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
                  <span className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-indigo-600 animate-pulse" />
                    <span>Trình nghe thử toàn bộ chương trình (Có khoảng lặng chuẩn):</span>
                  </span>
                  <a
                    href={masterAudioUrl}
                    download={`${episodeTitle.replace(/\s+/g, '_')}.wav`}
                    className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-black cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải Về File WAV Máy Tính</span>
                  </a>
                </div>
                <audio src={masterAudioUrl} controls className="w-full h-10 rounded-xl" />
              </div>
            )}
          </div>

          {/* Publish & Share Actions */}
          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-slate-800">
                Lưu vào hệ thống bài học & Phát cho học sinh
              </h4>
              <p className="text-xs text-slate-500 font-medium">
                Sau khi xuất bản, bài học sẽ có mặt trên "Góc Học Sinh" và có thể chia sẻ qua đường link trực tuyến cho mọi lớp học.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePublishEpisode}
                disabled={isPublishing || publishedSuccess}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-600 text-white font-black text-xs sm:text-sm rounded-2xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
              >
                {isPublishing ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Đang Lưu...</span>
                  </>
                ) : publishedSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Đã Xuất Bản Thành Công!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Lưu & Xuất Bản Ngay</span>
                  </>
                )}
              </button>

              {publishedSuccess && (
                <button
                  onClick={onOpenShareModal}
                  className="px-5 py-3 bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs sm:text-sm rounded-2xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Lấy Link Cho Lớp</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-start pt-4 border-t border-slate-100">
            <button
              onClick={() => setCurrentStep(4)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs sm:text-sm rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay Lại Bước 4</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

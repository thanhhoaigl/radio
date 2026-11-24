import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, Sparkles, CheckCircle2, 
  HelpCircle, Star, ThumbsUp, Radio, Award, ArrowRight, 
  Smile, Heart, MessageCircle, Mic, RefreshCw
} from 'lucide-react';
import { RadioEpisode, VocabWord, ScriptSegment, SentencePattern } from '../types/radio';
import { PRELOADED_TOPICS } from '../data/topics';
import { SoundFX } from '../utils/audioSynthesizer';

interface StudentClassroomProps {
  currentEpisode: RadioEpisode;
  onOpenShareModal: () => void;
}

export const StudentClassroom: React.FC<StudentClassroomProps> = ({ 
  currentEpisode, 
  onOpenShareModal 
}) => {
  // Activity tabs: 'listen' | 'flashcards' | 'pattern' | 'repeat' | 'quiz'
  const [activeActivity, setActiveActivity] = useState<'listen' | 'flashcards' | 'pattern' | 'repeat' | 'quiz'>('listen');

  // Full radio episode playback simulation
  const [isPlayingEpisode, setIsPlayingEpisode] = useState<boolean>(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [isPausedForStudentRepeat, setIsPausedForStudentRepeat] = useState<boolean>(false);
  const [currentAudioTime, setCurrentAudioTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const countdownTimerRef = useRef<any>(null);

  // Single word speech testing state
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);
  const wordAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sentence pattern interactive practice state
  const matchedTopic = PRELOADED_TOPICS.find((t) => t.id === currentEpisode.topicId);
  const sentencePattern = currentEpisode.sentencePattern || matchedTopic?.sentencePattern;
  const words = currentEpisode.targetWords || [];
  const [selectedPatternWord, setSelectedPatternWord] = useState<VocabWord>(words[0]);
  const [playingPatternText, setPlayingPatternText] = useState<string | null>(null);
  const [patternRepeatCountdown, setPatternRepeatCountdown] = useState<number>(0);
  const [isPlayingFullQA, setIsPlayingFullQA] = useState<boolean>(false);
  const patternRepeatTimerRef = useRef<any>(null);
  const patternAudioRef = useRef<HTMLAudioElement | null>(null);

  // Student repeat practice state
  const [repeatedWordIds, setRepeatedWordIds] = useState<string[]>([]);
  const [isMicListening, setIsMicListening] = useState<boolean>(false);
  const [audioPlayError, setAudioPlayError] = useState<string | null>(null);
  const [isPlayingJingle, setIsPlayingJingle] = useState<boolean>(false);
  const [patternStudentSpoken, setPatternStudentSpoken] = useState<boolean>(false);
  const [activePlayingPart, setActivePlayingPart] = useState<number | null>(null);

  // Dedicated Part 4 Repeat Sequence & countdown state
  const [isPlayingRepeatSequence, setIsPlayingRepeatSequence] = useState<boolean>(false);
  const [repeatSequenceTime, setRepeatSequenceTime] = useState<number>(0);
  const [repeatSequenceDuration, setRepeatSequenceDuration] = useState<number>(0);
  const repeatAudioRef = useRef<HTMLAudioElement | null>(null);
  const repeatSequenceCancelRef = useRef<boolean>(false);
  const [activeRepeatingWordId, setActiveRepeatingWordId] = useState<string | null>(null);
  const [wordRepeatCountdown, setWordRepeatCountdown] = useState<number>(0);
  const wordRepeatTimerRef = useRef<any>(null);

  // Synchronized Dialogue Stream state:
  // 'live' = dialogues appear sequentially as spoken; 'all' = full script with active highlight
  const [dialogueViewMode, setDialogueViewMode] = useState<'live' | 'all'>('live');
  const [autoScrollDialogue, setAutoScrollDialogue] = useState<boolean>(true);
  const [speakerFilter, setSpeakerFilter] = useState<'all' | 'mc_vietnamese' | 'mc_english'>('all');
  const activeSegmentRef = useRef<HTMLDivElement | null>(null);
  const dialogueContainerRef = useRef<HTMLDivElement | null>(null);

  // Interactive Quiz state
  const [currentQuizIndex, setCurrentQuizIndex] = useState<number>(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState<number>(0);
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);

  // Auto-scroll to active speaker's dialogue turn
  useEffect(() => {
    if (autoScrollDialogue && activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentSegmentIndex, autoScrollDialogue]);

  // Sync pattern word & reset state when episode changes
  useEffect(() => {
    setSelectedPatternWord((currentEpisode.targetWords || [])[0]);
    setPatternStudentSpoken(false);
    setRepeatedWordIds([]);
    setCurrentSegmentIndex(0);
    setCurrentAudioTime(0);
    setActivePlayingPart(null);
    setIsPlayingRepeatSequence(false);
    repeatSequenceCancelRef.current = true;
    if (repeatAudioRef.current) {
      repeatAudioRef.current.pause();
    }
  }, [currentEpisode.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      repeatSequenceCancelRef.current = true;
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
      }
      if (repeatAudioRef.current) {
        repeatAudioRef.current.pause();
      }
      if (patternAudioRef.current) {
        patternAudioRef.current.pause();
      }
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (wordRepeatTimerRef.current) clearInterval(wordRepeatTimerRef.current);
      if (patternRepeatTimerRef.current) clearInterval(patternRepeatTimerRef.current);
    };
  }, []);

  // Trigger 5-second silence interval for student repetition with soft chime cues
  const triggerWordRepeatCountdown = (wordId: string) => {
    if (wordRepeatTimerRef.current) clearInterval(wordRepeatTimerRef.current);
    // Gentle 2-note chime signaling "Your turn to speak!"
    SoundFX.playRepeatPromptChime();
    setActiveRepeatingWordId(wordId);
    setWordRepeatCountdown(5);
    let count = 5;
    wordRepeatTimerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(wordRepeatTimerRef.current);
        setActiveRepeatingWordId(null);
        setWordRepeatCountdown(0);
        SoundFX.playWordCompleteChime();
        setRepeatedWordIds((prev) => (prev.includes(wordId) ? prev : [...prev, wordId]));
      } else {
        setWordRepeatCountdown(count);
      }
    }, 1000);
  };

  // Play audio for a single word cleanly (without speaker name or number)
  const handlePlayWord = async (word: VocabWord) => {
    if (isPlayingRepeatSequence) {
      repeatSequenceCancelRef.current = true;
      if (repeatAudioRef.current) repeatAudioRef.current.pause();
      setIsPlayingRepeatSequence(false);
    }
    setPlayingWordId(word.id);
    setActiveRepeatingWordId(null);
    if (wordRepeatTimerRef.current) clearInterval(wordRepeatTimerRef.current);

    try {
      if (word.audioUrl) {
        const audio = new Audio(word.audioUrl);
        wordAudioRef.current = audio;
        audio.onended = () => {
          setPlayingWordId(null);
          triggerWordRepeatCountdown(word.id);
        };
        audio.onerror = () => setPlayingWordId(null);
        await audio.play();
        return;
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: word.english,
          voice: currentEpisode.voiceEn || 'Puck',
          language: 'en',
        }),
      });
      const data = await res.json();
      const audioSrc = data.audioUrl || (data.audioBase64 ? `data:audio/wav;base64,${data.audioBase64}` : null);
      if (audioSrc) {
        const audio = new Audio(audioSrc);
        wordAudioRef.current = audio;
        audio.onended = () => {
          setPlayingWordId(null);
          triggerWordRepeatCountdown(word.id);
        };
        audio.onerror = () => setPlayingWordId(null);
        await audio.play();
      } else {
        setPlayingWordId(null);
      }
    } catch {
      setPlayingWordId(null);
    }
  };

  // Helper to fetch and play a single TTS line as a Promise
  const playTtsPromise = (text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: currentEpisode.voiceEn || 'Puck',
            language: 'en',
          }),
        });
        const data = await res.json();
        const audioSrc = data.audioUrl || (data.audioBase64 ? `data:audio/wav;base64,${data.audioBase64}` : null);
        if (!audioSrc) {
          resolve();
          return;
        }
        const audio = new Audio(audioSrc);
        wordAudioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        await audio.play();
      } catch {
        resolve();
      }
    });
  };

  // Sync card highlights during demo_part_4.wav playback
  const syncPart4WordHighlight = (t: number) => {
    if (currentEpisode.id !== 'demo-greetings-01' || words.length < 3) return;
    // Matches exact offsets in demo_part_4.wav:
    // Hello: 12.97 - 19.17 (prompt cue at ~13.85s -> 4.1s repeat)
    // Goodbye: 20.32 - 26.93 (prompt cue at ~21.4s -> 4.1s repeat)
    // Thank you: 28.08 - 34.57 (prompt cue at ~29.1s -> 4.1s repeat)
    if (t >= 12.9 && t < 19.2) {
      setPlayingWordId(t < 14.0 ? words[0].id : null);
      if (t >= 14.0) {
        setActiveRepeatingWordId(words[0].id);
        setWordRepeatCountdown(Math.max(1, Math.ceil(19.17 - t)));
      } else {
        setActiveRepeatingWordId(null);
      }
    } else if (t >= 20.2 && t < 27.0) {
      setPlayingWordId(t < 21.5 ? words[1].id : null);
      if (t >= 21.5) {
        setActiveRepeatingWordId(words[1].id);
        setWordRepeatCountdown(Math.max(1, Math.ceil(26.93 - t)));
      } else {
        setActiveRepeatingWordId(null);
      }
    } else if (t >= 28.0 && t < 34.6) {
      setPlayingWordId(t < 29.2 ? words[2].id : null);
      if (t >= 29.2) {
        setActiveRepeatingWordId(words[2].id);
        setWordRepeatCountdown(Math.max(1, Math.ceil(34.57 - t)));
      } else {
        setActiveRepeatingWordId(null);
      }
    } else {
      setPlayingWordId(null);
      setActiveRepeatingWordId(null);
    }
  };

  // Play whole Part 4 Repeat Sequence with pleasant transition chimes & 5s pauses
  const handleToggleRepeatSequence = async () => {
    if (isPlayingRepeatSequence) {
      repeatSequenceCancelRef.current = true;
      if (repeatAudioRef.current) repeatAudioRef.current.pause();
      if (wordAudioRef.current) wordAudioRef.current.pause();
      if (wordRepeatTimerRef.current) clearInterval(wordRepeatTimerRef.current);
      setIsPlayingRepeatSequence(false);
      setPlayingWordId(null);
      setActiveRepeatingWordId(null);
      return;
    }

    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      setIsPlayingEpisode(false);
    }
    if (wordAudioRef.current) {
      wordAudioRef.current.pause();
      setPlayingWordId(null);
    }

    // For demo episode, play the studio-compiled Part 4 WAV with built-in marimba transitions & Cô Mai guidance
    if (currentEpisode.id === 'demo-greetings-01') {
      try {
        const part4AudioUrl = '/audio/demo_part_4.wav';
        if (!repeatAudioRef.current) {
          const audio = new Audio(part4AudioUrl);
          repeatAudioRef.current = audio;
          audio.ontimeupdate = () => {
            setRepeatSequenceTime(audio.currentTime);
            setRepeatSequenceDuration(audio.duration || 40.7);
            syncPart4WordHighlight(audio.currentTime);
          };
          audio.onended = () => {
            setIsPlayingRepeatSequence(false);
            setRepeatSequenceTime(0);
            setPlayingWordId(null);
            setActiveRepeatingWordId(null);
            SoundFX.playWordCompleteChime();
          };
          audio.onerror = () => {
            setIsPlayingRepeatSequence(false);
          };
        } else {
          if (!repeatAudioRef.current.src.includes(part4AudioUrl)) {
            repeatAudioRef.current.src = part4AudioUrl;
          }
          repeatAudioRef.current.currentTime = 0;
        }

        await repeatAudioRef.current.play();
        setIsPlayingRepeatSequence(true);
      } catch (e) {
        console.error('Lỗi phát chuỗi luyện nhắc lại:', e);
        setIsPlayingRepeatSequence(false);
      }
      return;
    }

    // For any custom / newly generated episode, run clean dynamic sequence with warm transition chimes
    repeatSequenceCancelRef.current = false;
    setIsPlayingRepeatSequence(true);

    for (let i = 0; i < words.length; i++) {
      if (repeatSequenceCancelRef.current) break;
      const word = words[i];

      // Play pleasant marimba/celesta transition chime between words
      SoundFX.playSectionTransition();
      await new Promise((r) => setTimeout(r, 1250));
      if (repeatSequenceCancelRef.current) break;

      setPlayingWordId(word.id);
      if (word.audioUrl) {
        await new Promise<void>((resolve) => {
          const a = new Audio(word.audioUrl!);
          wordAudioRef.current = a;
          a.onended = () => resolve();
          a.onerror = () => resolve();
          a.play().catch(() => resolve());
        });
      } else {
        await playTtsPromise(word.english);
      }
      setPlayingWordId(null);
      if (repeatSequenceCancelRef.current) break;

      // Soft "Your turn!" prompt chime + 5-second visual countdown
      SoundFX.playRepeatPromptChime();
      setActiveRepeatingWordId(word.id);
      for (let sec = 5; sec >= 1; sec--) {
        if (repeatSequenceCancelRef.current) break;
        setWordRepeatCountdown(sec);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setActiveRepeatingWordId(null);
      setWordRepeatCountdown(0);

      if (!repeatSequenceCancelRef.current) {
        setRepeatedWordIds((prev) => (prev.includes(word.id) ? prev : [...prev, word.id]));
      }
    }

    if (!repeatSequenceCancelRef.current) {
      SoundFX.playWordCompleteChime();
    }
    setIsPlayingRepeatSequence(false);
    setPlayingWordId(null);
    setActiveRepeatingWordId(null);
  };

  // Helper to dynamically build answer sentence applying the chosen vocabulary word
  const getAppliedAnswer = (pattern: SentencePattern | undefined, word: VocabWord | null): string => {
    if (!word) return pattern?.answerExampleEn || '';
    if (!pattern) return `${word.english}!`;
    const pat = pattern.answerPatternEn;
    const wLower = word.english.trim().toLowerCase();
    const isVowel = /^[aeiou]/i.test(word.english);

    // Greetings topic / "How are you today?": always answer naturally with "I'm good, thank you."
    if (
      currentEpisode.topicId === 'greetings' ||
      pat.includes('[tình trạng]') ||
      pat.toLowerCase().includes("i'm good, thank you") ||
      pat.toLowerCase().includes('i am good, thank you')
    ) {
      if (wLower === 'good morning') {
        return "Good morning! I'm good, thank you.";
      }
      if (wLower === 'goodbye') {
        return "I'm good, thank you. Goodbye!";
      }
      if (['good', 'fine', 'great', 'happy', 'ok', 'okay', 'wonderful'].includes(wLower)) {
        return `I'm ${wLower}, thank you.`;
      }
      return "I'm good, thank you.";
    }

    if (pat.includes('[đồ dùng]')) {
      return `It's ${isVowel ? 'an' : 'a'} ${wLower}.`;
    }
    if (pat.includes('[màu sắc]')) {
      return `It's ${wLower}.`;
    }
    if (pat.includes('[động vật]')) {
      return `It's ${isVowel ? 'an' : 'a'} ${wLower}.`;
    }
    if (pat.includes('[chữ số]')) {
      return wLower === 'one' ? 'I see one star!' : `I see ${wLower} stars!`;
    }
    if (pat.includes('[thành viên gia đình]') || pat.includes('[thành viên]')) {
      return `This is my ${wLower}.`;
    }
    if (pat.includes('[bộ phận]')) {
      return `This is my ${wLower}.`;
    }
    if (pat.includes('[trái cây]')) {
      if (wLower === 'mango') return 'Yes, I like mangoes!';
      if (wLower === 'watermelon') return 'Yes, I like watermelon!';
      return `Yes, I like ${wLower}s!`;
    }
    if (pat.includes('[hành động]')) {
      return `I can ${wLower}!`;
    }
    if (pat.includes('[cảm xúc]')) {
      return `I feel ${wLower}!`;
    }
    if (pat.includes('[thời tiết]')) {
      return `It's ${wLower} today.`;
    }
    if (pat.includes('[từ vựng]')) {
      return `I love my ${wLower}!`;
    }
    return pattern.answerExampleEn || `${word.english}!`;
  };

  const getAppliedAnswerVi = (pattern: SentencePattern | undefined, word: VocabWord | null): string => {
    if (!word) return pattern?.answerExampleVi || '';
    if (!pattern) return word.vietnamese;
    const pat = pattern.answerPatternEn;
    const wLower = word.english.trim().toLowerCase();

    if (
      currentEpisode.topicId === 'greetings' ||
      pat.includes('[tình trạng]') ||
      pat.toLowerCase().includes("i'm good, thank you") ||
      pat.toLowerCase().includes('i am good, thank you')
    ) {
      if (wLower === 'good morning') {
        return 'Chào buổi sáng! Mình khỏe, cảm ơn bạn.';
      }
      if (wLower === 'goodbye') {
        return 'Mình khỏe, cảm ơn bạn. Tạm biệt!';
      }
      return 'Mình khỏe, cảm ơn bạn.';
    }
    if (pat.includes('[đồ dùng]') || pat.includes('[động vật]')) {
      return `Đó là một ${word.vietnamese.toLowerCase()}.`;
    }
    if (pat.includes('[màu sắc]')) {
      return `Nó có màu ${word.vietnamese.toLowerCase()}.`;
    }
    if (pat.includes('[chữ số]')) {
      return `Mình thấy ${word.vietnamese.toLowerCase()} ngôi sao!`;
    }
    if (pat.includes('[thành viên gia đình]') || pat.includes('[thành viên]')) {
      return `Đây là ${word.vietnamese.toLowerCase()} của mình.`;
    }
    if (pat.includes('[bộ phận]')) {
      return `Đây là ${word.vietnamese.toLowerCase()} của em.`;
    }
    if (pat.includes('[trái cây]')) {
      return `Có chứ, mình rất thích ${word.vietnamese.toLowerCase()}!`;
    }
    if (pat.includes('[hành động]')) {
      return `Mình có thể ${word.vietnamese.toLowerCase()}!`;
    }
    if (pat.includes('[cảm xúc]')) {
      return `Hôm nay mình cảm thấy ${word.vietnamese.toLowerCase()}!`;
    }
    if (pat.includes('[thời tiết]')) {
      return `Hôm nay trời ${word.vietnamese.toLowerCase()}.`;
    }
    if (pat.includes('[từ vựng]')) {
      return `Mình rất yêu quý ${word.vietnamese.toLowerCase()} của mình!`;
    }
    return pattern.answerExampleVi || `Nghĩa: ${word.vietnamese}`;
  };

  // Start 5s visual repeat countdown for sentence patterns
  const triggerPatternRepeatCountdown = () => {
    if (patternRepeatTimerRef.current) clearInterval(patternRepeatTimerRef.current);
    SoundFX.playRepeatPromptChime();
    setPatternRepeatCountdown(5);
    let count = 5;
    patternRepeatTimerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(patternRepeatTimerRef.current);
        setPatternRepeatCountdown(0);
        SoundFX.playWordCompleteChime();
        setPatternStudentSpoken(true);
      } else {
        setPatternRepeatCountdown(count);
      }
    }, 1000);
  };

  // Play pattern sentence using Gemini TTS (with optional repeat prompt right after)
  const handlePlayPattern = async (text: string, triggerRepeatAfter = false) => {
    if (patternAudioRef.current) {
      patternAudioRef.current.pause();
    }
    if (patternRepeatTimerRef.current) clearInterval(patternRepeatTimerRef.current);
    setPatternRepeatCountdown(0);
    setPlayingPatternText(text);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: currentEpisode.voiceEn || 'Puck',
          language: 'en',
        }),
      });
      const data = await res.json();
      const audioSrc = data.audioUrl || (data.audioBase64 ? `data:audio/wav;base64,${data.audioBase64}` : null);
      if (audioSrc) {
        const audio = new Audio(audioSrc);
        patternAudioRef.current = audio;
        audio.onended = () => {
          setPlayingPatternText(null);
          if (triggerRepeatAfter) {
            triggerPatternRepeatCountdown();
          }
        };
        audio.onerror = () => setPlayingPatternText(null);
        await audio.play();
      } else {
        setPlayingPatternText(null);
      }
    } catch {
      setPlayingPatternText(null);
    }
  };

  // Play full Q&A dialogue sequentially: Question -> pleasant chime -> Answer -> student repeat!
  const handlePlayFullQAPattern = async (questionEn: string, answerEn: string) => {
    if (isPlayingFullQA) return;
    if (patternAudioRef.current) patternAudioRef.current.pause();
    if (patternRepeatTimerRef.current) clearInterval(patternRepeatTimerRef.current);
    setPatternRepeatCountdown(0);
    setIsPlayingFullQA(true);

    try {
      setPlayingPatternText(questionEn);
      await playTtsPromise(questionEn);
      setPlayingPatternText(null);

      // Gentle transition chime before answer
      SoundFX.playTick();
      await new Promise((r) => setTimeout(r, 650));

      setPlayingPatternText(answerEn);
      await playTtsPromise(answerEn);
      setPlayingPatternText(null);

      triggerPatternRepeatCountdown();
    } finally {
      setIsPlayingFullQA(false);
    }
  };

  // Play radio opening jingle
  const handlePlayIntroJingle = async () => {
    setIsPlayingJingle(true);
    try {
      const audio = new Audio('/audio/radio_intro_jingle.wav');
      audio.onended = () => setIsPlayingJingle(false);
      audio.onerror = () => {
        SoundFX.playIntroJingle();
        setIsPlayingJingle(false);
      };
      await audio.play();
    } catch {
      SoundFX.playIntroJingle();
      setIsPlayingJingle(false);
    }
  };

  // Play a specific Part (1 to 6) by seeking directly to its starting timestamp
  const handlePlayPart = async (partNum: number) => {
    setActivePlayingPart(partNum);
    setAudioPlayError(null);
    try {
      if (mainAudioRef.current) {
        const masterUrl = currentEpisode.fullAudioUrl || '/audio/demo-greetings-01-full.wav';
        if (!mainAudioRef.current.src.includes('demo-greetings-01-full.wav') && !mainAudioRef.current.src.includes(masterUrl)) {
          mainAudioRef.current.src = masterUrl;
        }

        const seg = currentEpisode.segments?.find((s) => s.part === partNum);
        if (seg && seg.startSeconds !== undefined) {
          mainAudioRef.current.currentTime = seg.startSeconds;
          setCurrentAudioTime(seg.startSeconds);
          const segIdx = currentEpisode.segments.findIndex((s) => s.id === seg.id);
          if (segIdx !== -1) setCurrentSegmentIndex(segIdx);
        } else if (audioDuration > 0) {
          mainAudioRef.current.currentTime = ((partNum - 1) / 6) * audioDuration;
        }

        await mainAudioRef.current.play();
        setIsPlayingEpisode(true);
      }
    } catch (err: any) {
      console.error('Lỗi phát phần:', err);
      setAudioPlayError(`Không thể tự động phát Phần ${partNum}. Vui lòng bấm nút phát trên thanh âm thanh.`);
    }
  };

  // Seek audio directly to a character's dialogue turn
  const handleSeekToSegment = async (seg: ScriptSegment, idx: number) => {
    if (mainAudioRef.current && seg.startSeconds !== undefined) {
      const masterUrl = currentEpisode.fullAudioUrl || '/audio/demo-greetings-01-full.wav';
      if (!mainAudioRef.current.src.includes('demo-greetings-01-full.wav') && !mainAudioRef.current.src.includes(masterUrl)) {
        mainAudioRef.current.src = masterUrl;
      }
      mainAudioRef.current.currentTime = seg.startSeconds;
      setCurrentAudioTime(seg.startSeconds);
      setCurrentSegmentIndex(idx);
      try {
        await mainAudioRef.current.play();
        setIsPlayingEpisode(true);
      } catch {
        // user interaction might already be present
      }
    }
  };

  const handleTogglePlayEpisode = async () => {
    setAudioPlayError(null);
    setActivePlayingPart(null);
    if (mainAudioRef.current) {
      if (isPlayingEpisode) {
        mainAudioRef.current.pause();
        setIsPlayingEpisode(false);
      } else {
        try {
          // Ensure main audio src is the master episode
          const masterUrl = currentEpisode.fullAudioUrl || '/audio/demo-greetings-01-full.wav';
          if (!mainAudioRef.current.src.includes('full') && !mainAudioRef.current.src.includes(masterUrl)) {
            mainAudioRef.current.src = masterUrl;
          }
          await mainAudioRef.current.play();
          setIsPlayingEpisode(true);
        } catch (err: any) {
          console.error('Lỗi phát âm thanh:', err);
          setAudioPlayError('Trình duyệt đang chặn tự phát âm thanh. Vui lòng bấm nút Tam giác (Phát) màu xanh trên thanh điều khiển âm thanh bên dưới.');
        }
      }
    }
  };

  const handleResetEpisode = () => {
    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      mainAudioRef.current.currentTime = 0;
      setIsPlayingEpisode(false);
      setActivePlayingPart(null);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Student practice repeat
  const handleStudentRepeatCheck = (wordId: string) => {
    SoundFX.playCorrect();
    if (!repeatedWordIds.includes(wordId)) {
      setRepeatedWordIds([...repeatedWordIds, wordId]);
    }
  };

  // Generate quiz questions based on the target words
  const currentWord = words[currentQuizIndex] || words[0];

  const handleSelectQuizAnswer = (isCorrect: boolean, optIndex: number) => {
    setSelectedQuizOption(optIndex);
    setQuizSubmitted(true);
    if (isCorrect) {
      SoundFX.playCorrect();
      setQuizScore((prev) => prev + 1);
    } else {
      SoundFX.playTryAgain();
    }
  };

  const handleNextQuizQuestion = () => {
    setSelectedQuizOption(null);
    setQuizSubmitted(false);
    if (currentQuizIndex < words.length - 1) {
      setCurrentQuizIndex((prev) => prev + 1);
    } else {
      SoundFX.playApplause();
    }
  };

  const currentSegment = currentEpisode.segments?.[currentSegmentIndex];

  return (
    <div className="space-y-6">
      {/* Friendly Student Banner */}
      <div className="bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-black uppercase tracking-wider">
              <Radio className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
              <span>Góc Học Sinh · Classroom Audio Player</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Đài Phát Thanh Tiếng Anh Vui Vẻ
            </h2>
            <p className="text-sm text-sky-100 max-w-xl font-medium">
              Chào mừng các bạn nhỏ! Hãy cùng lắng nghe, nhắc lại thật to và chơi trò chơi đố vui để nhận những ngôi sao may mắn nhé!
            </p>
          </div>

          {/* Today's Target Words Badge */}
          <div className="bg-white/15 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 flex items-center gap-3">
            <span className="text-3xl">🌟</span>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-amber-200">
                Từ vựng hôm nay ({words.length} từ):
              </div>
              <div className="text-sm font-extrabold text-white">
                {words.map((w) => w.english).join(' · ')}
              </div>
            </div>
          </div>
        </div>

        {/* Activity Tab Buttons */}
        <div className="mt-6 pt-4 border-t border-white/20 flex items-center gap-2 overflow-x-auto text-xs font-black">
          <button
            onClick={() => setActiveActivity('listen')}
            className={`px-4 py-2 rounded-2xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeActivity === 'listen'
                ? 'bg-white text-sky-800 shadow-md scale-102'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>1. Nghe Phát Thanh</span>
          </button>

          <button
            onClick={() => setActiveActivity('flashcards')}
            className={`px-4 py-2 rounded-2xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeActivity === 'flashcards'
                ? 'bg-white text-sky-800 shadow-md scale-102'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>2. Thẻ Từ Vựng Thông Minh</span>
          </button>

          <button
            onClick={() => {
              setActiveActivity('pattern');
              if (!selectedPatternWord && words.length > 0) {
                setSelectedPatternWord(words[0]);
              }
            }}
            className={`px-4 py-2 rounded-2xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeActivity === 'pattern'
                ? 'bg-white text-sky-800 shadow-md scale-102'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <MessageCircle className="w-4 h-4 text-emerald-300" />
            <span>3. Mẫu Câu Thực Hành</span>
          </button>

          <button
            onClick={() => setActiveActivity('repeat')}
            className={`px-4 py-2 rounded-2xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeActivity === 'repeat'
                ? 'bg-white text-sky-800 shadow-md scale-102'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <Mic className="w-4 h-4 text-rose-300" />
            <span>4. Nghe & Nhắc Lại</span>
          </button>

          <button
            onClick={() => setActiveActivity('quiz')}
            className={`px-4 py-2 rounded-2xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeActivity === 'quiz'
                ? 'bg-white text-sky-800 shadow-md scale-102'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>5. Đố Vui Nhận Sao ({quizScore}/{words.length})</span>
          </button>
        </div>
      </div>

      {/* --- ACTIVITY 1: RADIO PLAYER STATION --- */}
      {activeActivity === 'listen' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          {/* Target Sentence Pattern Quick Card */}
          {sentencePattern && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-md">
                    Mẫu câu giao tiếp trọng tâm hôm nay
                  </span>
                  <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
                    {sentencePattern.guideVi}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm sm:text-base font-black text-slate-900 pt-0.5">
                  <span className="text-sky-700">❓ {sentencePattern.questionEn}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-emerald-700">💬 {sentencePattern.answerExampleEn}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveActivity('pattern');
                  if (!selectedPatternWord && words.length > 0) setSelectedPatternWord(words[0]);
                }}
                className="self-start sm:self-center px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                <span>Luyện Ghép Câu</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-gradient-to-br from-sky-50 via-indigo-50/40 to-pink-50/30 p-6 sm:p-8 rounded-3xl border border-sky-100">
            {/* Retro Radio Visual Device */}
            <div className="w-full md:w-72 bg-gradient-to-b from-amber-100 to-amber-200 p-5 rounded-3xl shadow-inner border-4 border-amber-300 flex flex-col items-center justify-center relative">
              {/* Antenna */}
              <div className="w-2 h-10 bg-slate-400 rounded-full absolute -top-9 right-8 transform rotate-12"></div>
              {/* Radio Dial & Speaker Grill */}
              <div className="w-full bg-white/80 rounded-2xl p-4 shadow-2xs mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isPlayingEpisode ? 'bg-rose-500 animate-ping' : 'bg-slate-300'}`}></div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                    HAPPY FM 99.9
                  </span>
                </div>
                {/* Equalizer waves */}
                {isPlayingEpisode && (
                  <div className="flex items-end gap-1 h-5">
                    <span className="w-1 bg-sky-500 rounded-full animate-soundwave-1"></span>
                    <span className="w-1 bg-sky-500 rounded-full animate-soundwave-2"></span>
                    <span className="w-1 bg-sky-500 rounded-full animate-soundwave-3"></span>
                    <span className="w-1 bg-sky-500 rounded-full animate-soundwave-4"></span>
                    <span className="w-1 bg-sky-500 rounded-full animate-soundwave-5"></span>
                  </div>
                )}
              </div>

              {/* Main Play / Pause Dial */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTogglePlayEpisode}
                  className={`w-18 h-18 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 cursor-pointer ${
                    isPlayingEpisode
                      ? 'bg-rose-500 hover:bg-rose-600 ring-4 ring-rose-200'
                      : 'bg-sky-500 hover:bg-sky-600 ring-4 ring-sky-200'
                  }`}
                  title={isPlayingEpisode ? 'Tạm dừng đài' : 'Bật đài phát thanh'}
                >
                  {isPlayingEpisode ? (
                    <Pause className="w-8 h-8" />
                  ) : (
                    <Play className="w-8 h-8 fill-current ml-1" />
                  )}
                </button>
                <button
                  onClick={handleResetEpisode}
                  className="w-10 h-10 rounded-full bg-white hover:bg-slate-100 text-slate-600 flex items-center justify-center shadow-xs cursor-pointer"
                  title="Phát lại từ đầu"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Intro Jingle button for teacher */}
              <button
                onClick={handlePlayIntroJingle}
                disabled={isPlayingJingle}
                className={`mt-3.5 px-3.5 py-2 rounded-xl font-extrabold text-[11px] shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  isPlayingJingle
                    ? 'bg-amber-500 text-white animate-pulse'
                    : 'bg-amber-400 hover:bg-amber-300 text-amber-950'
                }`}
                title="Bấm để phát nhạc hiệu mở đài radio khởi động chương trình"
              >
                <span>🎺 {isPlayingJingle ? 'Đang phát nhạc hiệu...' : 'Nhạc Hiệu Mở Đài (Jingle)'}</span>
              </button>
            </div>

            {/* Currently Playing Teleprompter / Status */}
            <div className="flex-1 space-y-3 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-sky-700">
                    {isPlayingEpisode ? 'ĐANG PHÁT SÓNG TRỰC TIẾP' : 'SẴN SÀNG PHÁT SÓNG'}
                  </span>
                  {isPlayingEpisode && currentAudioTime < 4 && (
                    <span className="text-[11px] font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md animate-bounce">
                      🎶 Nhạc hiệu mở đài radio khởi động...
                    </span>
                  )}
                  {activePlayingPart && (
                    <span className="text-[11px] font-black text-sky-700 bg-sky-100 px-2 py-0.5 rounded-md">
                      Đang phát: Phần {activePlayingPart}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-slate-500">
                  Đoạn {currentSegmentIndex + 1} / {currentEpisode.segments?.length || 1}
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
                {currentEpisode.title}
              </h3>

              {/* Presenters Info Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white/90 p-2.5 rounded-xl border border-sky-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-600">Phát thanh viên:</span>
                  <span className="px-2 py-0.5 rounded-lg bg-pink-100 text-pink-900 font-black">
                    👩‍🏫 Cô Mai (Việt Nam)
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 font-black">
                    👨‍🏫 Thầy David (Mỹ · Bản ngữ)
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500">
                  Giọng nam thầy David phát âm chuẩn Mỹ cho thiếu nhi
                </span>
              </div>

              {/* Error notice if browser blocked autoplay */}
              {audioPlayError && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-950 font-bold">
                  <span>⚠️ {audioPlayError}</span>
                  <button
                    onClick={() => {
                      if (mainAudioRef.current) {
                        mainAudioRef.current.play().then(() => {
                          setIsPlayingEpisode(true);
                          setAudioPlayError(null);
                        }).catch(() => {});
                      }
                    }}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black cursor-pointer"
                  >
                    Bấm phát ngay
                  </button>
                </div>
              )}

              {/* Current Live Speaking Spotlight */}
              {currentSegmentIndex === -1 && isPlayingEpisode ? (
                <div className="p-5 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50/70 shadow-sm animate-pulse">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl animate-bounce">🎺</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase px-2 py-0.5 rounded-lg bg-amber-200 text-amber-900">
                          Nhạc Hiệu Mở Đài (Intro Jingle)
                        </span>
                        <span className="text-xs font-bold text-amber-800">
                          Happy English Radio 99.9 FM
                        </span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-slate-900 mt-1">
                        Giai điệu vui tươi đang mở đầu chương trình phát thanh...
                      </div>
                      <div className="text-xs font-semibold text-slate-600 mt-0.5">
                        Thầy David và Cô Mai chuẩn bị cất tiếng chào các em sau vài giây nữa nhé!
                      </div>
                    </div>
                  </div>
                </div>
              ) : currentSegment ? (
                <div
                  className={`p-5 rounded-2xl border-2 transition-all shadow-xs ${
                    currentSegment.language === 'en'
                      ? 'bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border-emerald-300 ring-2 ring-emerald-100'
                      : 'bg-gradient-to-br from-pink-50/90 via-rose-50/40 to-white border-pink-300 ring-2 ring-pink-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {currentSegment.language === 'en' ? '👨‍🏫' : '👩‍🏫'}
                      </span>
                      <span
                        className={`text-xs font-black uppercase px-2.5 py-1 rounded-xl flex items-center gap-1.5 ${
                          currentSegment.language === 'en'
                            ? 'bg-emerald-200 text-emerald-950'
                            : 'bg-pink-200 text-pink-950'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                        <span>{currentSegment.speakerName}</span>
                      </span>
                      <span className="text-xs font-bold text-slate-500 hidden sm:inline">
                        {currentSegment.partNameVi}
                      </span>
                    </div>

                    {currentSegment.startSeconds !== undefined && (
                      <span className="text-xs font-mono font-bold text-slate-500 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200">
                        ⏱️ {formatTime(currentSegment.startSeconds)}
                      </span>
                    )}
                  </div>

                  <div className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
                    {currentSegment.spokenText}
                  </div>

                  {currentSegment.textVi && currentSegment.language === 'en' && (
                    <div className="mt-2.5 text-xs sm:text-sm font-semibold text-slate-600 bg-white/80 p-2.5 rounded-xl border border-emerald-100 flex items-center gap-2">
                      <span>💡</span>
                      <span>Nghĩa tiếng Việt: <strong className="text-slate-800">{currentSegment.textVi}</strong></span>
                    </div>
                  )}

                  {/* Pause for Student Repetition Alert */}
                  {currentSegment.part === 4 && currentSegment.language === 'en' && (
                    <div className="mt-3 p-3 bg-amber-100/90 border-2 border-amber-300 rounded-xl flex items-center justify-between animate-pulse">
                      <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-amber-950">
                        <Mic className="w-4 h-4 text-rose-500 animate-bounce" />
                        <span>KHOẢNG LẶNG 5S: ĐẾN LƯỢT CẢ LỚP NHẮC LẠI THẬT TO!</span>
                      </div>
                      <span className="text-xs font-black bg-amber-400 text-amber-950 px-2.5 py-1 rounded-lg">
                        Lặp lại: "{currentSegment.spokenText}"
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 bg-slate-50 rounded-2xl text-xs font-medium text-slate-500 text-center border border-slate-200">
                  Bấm nút Tam giác (Phát) ở trên để bắt đầu nghe phát thanh đồng bộ lời nói nhé!
                </div>
              )}

              {/* Native HTML5 Audio Player with direct stream */}
              <div className="bg-white/95 p-3.5 sm:p-4 rounded-2xl border border-sky-200 shadow-2xs space-y-2 mt-4">
                <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
                  <span className="flex items-center gap-1.5 text-sky-700">
                    <Volume2 className="w-4 h-4 text-sky-500 shrink-0" />
                    <span>Thanh phát âm thanh radio hoàn chỉnh (Đồng bộ từng nhân vật):</span>
                  </span>
                  <span className="text-slate-500 font-mono font-black">
                    {formatTime(currentAudioTime)} / {formatTime(audioDuration || 215)}
                  </span>
                </div>
                <audio
                  ref={mainAudioRef}
                  src={currentEpisode.fullAudioUrl || '/audio/demo-greetings-01-full.wav'}
                  controls
                  preload="auto"
                  className="w-full h-10 rounded-xl"
                  onPlay={() => {
                    setIsPlayingEpisode(true);
                    setAudioPlayError(null);
                  }}
                  onPause={() => setIsPlayingEpisode(false)}
                  onTimeUpdate={(e) => {
                    const audio = e.currentTarget;
                    const curTime = audio.currentTime;
                    setCurrentAudioTime(curTime);
                    setAudioDuration(audio.duration || 215);

                    const segments = currentEpisode.segments || [];
                    if (!segments.length) return;

                    // 1. If audio is before first speech segment (Intro Jingle period: 0s - 4.6s)
                    const firstStart = segments[0]?.startSeconds ?? 4.6;
                    if (curTime < firstStart) {
                      setCurrentSegmentIndex(-1);
                      return;
                    }

                    // 2. Exact segment matching by startSeconds and endSeconds
                    const exactIdx = segments.findIndex((s) => {
                      if (s.startSeconds !== undefined && s.endSeconds !== undefined) {
                        return curTime >= s.startSeconds && curTime < s.endSeconds;
                      }
                      return false;
                    });

                    if (exactIdx !== -1) {
                      setCurrentSegmentIndex(exactIdx);
                    } else {
                      // Transition period: stay on the latest started segment
                      let latestIdx = 0;
                      for (let i = 0; i < segments.length; i++) {
                        if (segments[i].startSeconds !== undefined && segments[i].startSeconds! <= curTime) {
                          latestIdx = i;
                        }
                      }
                      setCurrentSegmentIndex(latestIdx);
                    }
                  }}
                  onEnded={() => {
                    setIsPlayingEpisode(false);
                    SoundFX.playOutro();
                  }}
                />

                {/* Quick Section Jumpers */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
                    <span>Chọn nghe nhanh từng phần bài học:</span>
                    <span className="text-[10px] text-sky-600 font-bold">Bấm để nhảy tới phần đó</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5">
                    {[
                      { num: 1, name: '1. Chào Mừng', icon: '👋' },
                      { num: 2, name: '2. Từ & Mẫu Câu', icon: '📖' },
                      { num: 3, name: '3. Nghe & Đoán', icon: '❓' },
                      { num: 4, name: '4. Nghe & Nhắc', icon: '🎙️' },
                      { num: 5, name: '5. Thử Thách', icon: '⭐' },
                      { num: 6, name: '6. Tạm Biệt', icon: '🌟' },
                    ].map((p) => (
                      <button
                        key={p.num}
                        onClick={() => handlePlayPart(p.num)}
                        className={`p-1.5 rounded-lg text-left border transition-all text-[11px] font-extrabold cursor-pointer active:scale-95 ${
                          activePlayingPart === p.num
                            ? 'bg-sky-500 text-white border-sky-600 shadow-xs'
                            : 'bg-slate-50 hover:bg-sky-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <div className="truncate">{p.icon} {p.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Turn-by-Turn Dialogue Stream (Hội thoại xuất hiện theo từng lượt nói của nhân vật) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 mt-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎙️</span>
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-900">
                        Hội Thoại Xuất Hiện Theo Từng Lượt Nói Của Nhân Vật
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Lời nói hiển thị đồng bộ từng câu theo tiến trình audio của Cô Mai và Thầy David
                      </p>
                    </div>
                  </div>

                  {/* Mode & Auto-scroll Toggles */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-[11px] font-bold text-slate-600">
                      <button
                        onClick={() => setDialogueViewMode('live')}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          dialogueViewMode === 'live'
                            ? 'bg-white text-sky-800 shadow-xs font-black'
                            : 'hover:text-slate-900'
                        }`}
                        title="Từng lời nói xuất hiện theo nhịp audio phát thanh thực tế"
                      >
                        ⚡ Theo nhịp nói
                      </button>
                      <button
                        onClick={() => setDialogueViewMode('all')}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          dialogueViewMode === 'all'
                            ? 'bg-white text-sky-800 shadow-xs font-black'
                            : 'hover:text-slate-900'
                        }`}
                        title="Xem toàn bộ các câu thoại của bài học"
                      >
                        📜 Toàn bộ kịch bản
                      </button>
                    </div>

                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoScrollDialogue}
                        onChange={(e) => setAutoScrollDialogue(e.target.checked)}
                        className="rounded text-sky-500 focus:ring-sky-400"
                      />
                      <span>Tự cuộn</span>
                    </label>
                  </div>
                </div>

                {/* Speaker filter tabs */}
                <div className="flex items-center gap-1.5 text-[11px] font-bold overflow-x-auto pb-1">
                  <span className="text-slate-400 shrink-0">Lọc nhân vật:</span>
                  {[
                    { id: 'all', label: 'Tất cả nhân vật' },
                    { id: 'mc_vietnamese', label: '👩‍🏫 Cô Mai' },
                    { id: 'mc_english', label: '👨‍🏫 Thầy David' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSpeakerFilter(f.id as any)}
                      className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        speakerFilter === f.id
                          ? 'bg-sky-100 text-sky-900 font-black'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Dialogue List Feed */}
                <div 
                  ref={dialogueContainerRef}
                  className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1.5 scrollbar-thin scroll-smooth"
                >
                  {/* Intro Jingle Item */}
                  {(dialogueViewMode === 'all' || currentAudioTime < 5.0) && (
                    <div 
                      onClick={() => {
                        if (mainAudioRef.current) {
                          mainAudioRef.current.currentTime = 0;
                          mainAudioRef.current.play().catch(() => {});
                          setIsPlayingEpisode(true);
                        }
                      }}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                        currentSegmentIndex === -1
                          ? 'bg-amber-100/90 border-amber-300 ring-2 ring-amber-200 shadow-xs'
                          : 'bg-slate-50/70 border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🎺</span>
                        <div>
                          <div className="font-extrabold text-amber-950">
                            Nhạc hiệu mở đài Happy English Radio (00:00 - 00:04)
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            Giai điệu khởi động chào đón học sinh
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-white text-slate-600 border border-slate-200">
                        ▶ 00:00
                      </span>
                    </div>
                  )}

                  {/* Character dialogue segments */}
                  {(currentEpisode.segments || [])
                    .filter((seg) => speakerFilter === 'all' || seg.speaker === speakerFilter)
                    .map((seg, origIdx) => {
                      const actualIdx = (currentEpisode.segments || []).findIndex((s) => s.id === seg.id);
                      const isActive = currentSegmentIndex === actualIdx;
                      const hasPlayed = seg.startSeconds !== undefined && currentAudioTime >= seg.startSeconds;
                      
                      // In 'live' mode, only show if this turn has arrived or is active
                      if (dialogueViewMode === 'live' && !hasPlayed && !isActive) {
                        return null;
                      }

                      const isEn = seg.language === 'en';

                      return (
                        <div
                          key={seg.id}
                          ref={isActive ? activeSegmentRef : null}
                          onClick={() => handleSeekToSegment(seg, actualIdx)}
                          className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                            isActive
                              ? isEn
                                ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-200 shadow-md scale-[1.01]'
                                : 'bg-pink-50/90 border-pink-400 ring-2 ring-pink-200 shadow-md scale-[1.01]'
                              : hasPlayed
                              ? isEn
                                ? 'bg-emerald-50/30 border-emerald-200/70 hover:border-emerald-300'
                                : 'bg-pink-50/30 border-pink-200/70 hover:border-pink-300'
                              : 'bg-white border-slate-200 hover:border-slate-300 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">{isEn ? '👨‍🏫' : '👩‍🏫'}</span>
                              <span
                                className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-md ${
                                  isEn
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : 'bg-pink-100 text-pink-900'
                                }`}
                              >
                                {seg.speakerName}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {seg.partNameVi?.split(':')[0] || `Phần ${seg.part}`}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isActive && (
                                <span className="flex items-center gap-1 text-[10px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  <span>ĐANG NÓI</span>
                                </span>
                              )}
                              {seg.startSeconds !== undefined && (
                                <span
                                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all ${
                                    isActive
                                      ? 'bg-sky-500 text-white border-sky-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-sky-50'
                                  }`}
                                  title="Bấm để nghe đoạn này"
                                >
                                  <span>▶</span>
                                  <span>{formatTime(seg.startSeconds)}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className={`font-black text-slate-900 leading-snug ${isActive ? 'text-base sm:text-lg' : 'text-sm'}`}>
                            {seg.spokenText}
                          </div>

                          {seg.textVi && isEn && (
                            <div className="mt-1.5 text-xs font-semibold text-slate-600 bg-white/70 p-1.5 rounded-lg border border-slate-100">
                              💡 {seg.textVi}
                            </div>
                          )}

                          {seg.part === 4 && isEn && (
                            <div className="mt-1.5 text-[11px] font-extrabold text-amber-800 bg-amber-50 p-1.5 rounded-lg border border-amber-200 flex items-center gap-1">
                              <span>⏱️</span>
                              <span>Có khoảng dừng 5 giây để học sinh nhắc lại</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ACTIVITY 2: SMART FLASHCARDS --- */}
      {activeActivity === 'flashcards' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-800">Thẻ Từ Vựng Thông Minh</h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Chạm vào loa để nghe giọng đọc bản ngữ chuẩn Mỹ, quan sát hình ảnh và nhắc lại nhiều lần!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {words.map((word) => {
              const isPlaying = playingWordId === word.id;
              return (
                <div
                  key={word.id}
                  className="bg-gradient-to-b from-sky-50/50 to-white border-2 border-sky-100 rounded-3xl p-6 flex flex-col items-center text-center shadow-xs hover:shadow-md transition-all group"
                >
                  {/* Emoji / Illustration Badge */}
                  <div className="w-24 h-24 rounded-3xl bg-amber-100/60 border border-amber-200/80 flex items-center justify-center text-5xl mb-4 group-hover:scale-105 transition-transform">
                    {word.icon}
                  </div>

                  {/* Word title & Phonetic */}
                  <div className="text-2xl font-black text-slate-900">{word.english}</div>
                  <div className="text-xs font-bold text-sky-600 bg-sky-50 px-2.5 py-0.5 rounded-full mt-1">
                    {word.phonetic}
                  </div>

                  {/* Vietnamese Meaning */}
                  <div className="text-base font-extrabold text-amber-800 mt-2">
                    {word.vietnamese}
                  </div>

                  {/* Example sentences */}
                  {word.exampleEn && (
                    <div className="mt-4 p-3 bg-slate-50 rounded-2xl w-full text-left space-y-1">
                      <div className="text-xs font-bold text-slate-700">💬 "{word.exampleEn}"</div>
                      <div className="text-[11px] font-medium text-slate-500">"{word.exampleVi}"</div>
                    </div>
                  )}

                  {/* Audio Listen Button */}
                  <button
                    onClick={() => handlePlayWord(word)}
                    disabled={isPlaying}
                    className={`mt-5 w-full py-2.5 px-4 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isPlaying
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
                    }`}
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>{isPlaying ? 'Đang phát...' : 'Nghe Phát Âm Chuẩn'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- ACTIVITY 3: SENTENCE PATTERN PRACTICE (MẪU CÂU THỰC HÀNH) --- */}
      {activeActivity === 'pattern' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-black uppercase tracking-wider mb-2">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                <span>Mẫu Câu Giao Tiếp Trọng Tâm Của Bài</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-800">
                Vận Dụng Từ Vựng Vào Mẫu Câu Tiếng Anh
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                {sentencePattern?.guideVi || 'Học sinh bấm chọn từng từ vựng bên dưới để nghe thầy giáo bản ngữ đọc câu hoàn chỉnh và nhắc lại theo.'}
              </p>
            </div>

            {/* Praise Stars Badge */}
            {patternStudentSpoken && (
              <div className="bg-amber-100 border border-amber-300 px-4 py-2 rounded-2xl flex items-center gap-2 text-amber-950 font-extrabold text-xs animate-bounce">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span>Bé đã phát âm mẫu câu rất tuyệt vời!</span>
              </div>
            )}
          </div>

          {sentencePattern ? (
            <div className="space-y-6">
              {/* Question & Base Answer Display Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Question Box */}
                <div className="bg-gradient-to-br from-sky-50 to-blue-50/60 p-5 rounded-2xl border-2 border-sky-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-sky-700">
                      1. Câu Hỏi (Question)
                    </span>
                    <button
                      onClick={() => handlePlayPattern(sentencePattern.questionEn)}
                      disabled={playingPatternText === sentencePattern.questionEn}
                      className="px-3 py-1 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{playingPatternText === sentencePattern.questionEn ? 'Đang đọc...' : 'Nghe Thầy Hỏi'}</span>
                    </button>
                  </div>
                  <div className="text-2xl font-black text-sky-950">
                    {sentencePattern.questionEn}
                  </div>
                  <div className="text-sm font-bold text-sky-800">
                    Nghĩa tiếng Việt: {sentencePattern.questionVi}
                  </div>
                </div>

                {/* Pattern Answer Formula Box */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 p-5 rounded-2xl border-2 border-emerald-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                      2. Câu Trả Lời Mẫu (Answer)
                    </span>
                    <button
                      onClick={() => handlePlayPattern(sentencePattern.answerExampleEn, true)}
                      disabled={playingPatternText === sentencePattern.answerExampleEn}
                      className="px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>
                        {playingPatternText === sentencePattern.answerExampleEn
                          ? 'Đang đọc...'
                          : 'Nghe Thầy Trả Lời'}
                      </span>
                    </button>
                  </div>
                  <div className="text-2xl font-black text-emerald-950">
                    {sentencePattern.answerPatternEn || sentencePattern.answerExampleEn}
                  </div>
                  <div className="text-sm font-semibold text-emerald-800">
                    Ví dụ mẫu: <span className="font-black text-emerald-950">{sentencePattern.answerExampleEn}</span> ({sentencePattern.answerExampleVi})
                  </div>
                </div>
              </div>

              {/* Step 1: Word Chooser */}
              <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center text-[11px] font-black">1</span>
                    <span>Bước 1: Bấm chọn một từ vựng để thực hành cùng mẫu câu:</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    Đang chọn: <strong className="text-sky-700">{selectedPatternWord?.english}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {words.map((w) => {
                    const isSelected = selectedPatternWord?.id === w.id;
                    return (
                      <button
                        key={w.id}
                        onClick={() => {
                          setSelectedPatternWord(w);
                          setPatternStudentSpoken(false);
                          setPatternRepeatCountdown(0);
                          if (patternRepeatTimerRef.current) clearInterval(patternRepeatTimerRef.current);
                        }}
                        className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center text-center cursor-pointer ${
                          isSelected
                            ? 'bg-white border-sky-500 shadow-md ring-3 ring-sky-200 scale-102'
                            : 'bg-white/70 hover:bg-white border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        <span className="text-3xl mb-1">{w.icon}</span>
                        <span className="text-base font-black text-slate-900">{w.english}</span>
                        <span className="text-xs font-bold text-slate-500">{w.vietnamese}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Full Applied Dialogue Result */}
              {selectedPatternWord && (
                <div className="bg-gradient-to-r from-amber-50 via-orange-50/40 to-amber-50/80 p-6 rounded-3xl border-2 border-amber-300 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center text-[11px] font-black">2</span>
                      <span>Bước 2: Nghe hỏi - đáp và nói theo thầy giáo:</span>
                    </span>
                    <span className="text-xs font-extrabold text-amber-800 bg-amber-200/80 px-2.5 py-0.5 rounded-full">
                      Hội thoại mẫu
                    </span>
                  </div>

                  <div className="space-y-3 bg-white p-5 rounded-2xl border border-amber-200/90 shadow-2xs">
                    {/* Question Line */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="px-2.5 py-0.5 rounded-lg bg-sky-100 text-sky-900 font-black text-xs shrink-0 mt-0.5">
                          ❓ Thầy David hỏi
                        </span>
                        <div>
                          <div className="text-xl sm:text-2xl font-black text-slate-900">
                            {sentencePattern.questionEn}
                          </div>
                          <div className="text-xs font-semibold text-slate-500 mt-0.5">
                            "{sentencePattern.questionVi}"
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handlePlayPattern(sentencePattern.questionEn, false)}
                        disabled={playingPatternText === sentencePattern.questionEn}
                        className="self-start sm:self-center px-3 py-1.5 bg-sky-100 hover:bg-sky-200 disabled:opacity-50 text-sky-900 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{playingPatternText === sentencePattern.questionEn ? 'Đang đọc...' : 'Nghe câu hỏi'}</span>
                      </button>
                    </div>

                    <div className="border-t border-slate-100 my-2"></div>

                    {/* Answer Line */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 font-black text-xs shrink-0 mt-0.5">
                          💬 Cả lớp trả lời
                        </span>
                        <div>
                          <div className="text-xl sm:text-2xl font-black text-emerald-800 flex items-center gap-2 flex-wrap">
                            <span>{getAppliedAnswer(sentencePattern, selectedPatternWord)}</span>
                            <span className="text-2xl">{selectedPatternWord.icon}</span>
                          </div>
                          <div className="text-xs font-bold text-slate-600 mt-0.5">
                            "{getAppliedAnswerVi(sentencePattern, selectedPatternWord)}"
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handlePlayPattern(getAppliedAnswer(sentencePattern, selectedPatternWord), true)}
                        disabled={playingPatternText === getAppliedAnswer(sentencePattern, selectedPatternWord)}
                        className="self-start sm:self-center px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 disabled:opacity-50 text-emerald-900 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>
                          {playingPatternText === getAppliedAnswer(sentencePattern, selectedPatternWord)
                            ? 'Đang đọc...'
                            : 'Nghe câu trả lời'}
                        </span>
                      </button>
                    </div>

                    {/* Visual countdown cue for student to speak the answer */}
                    {patternRepeatCountdown > 0 && (
                      <div className="mt-3 p-3 bg-amber-100/90 border border-amber-300 rounded-2xl space-y-1.5 animate-pulse">
                        <div className="flex items-center justify-between text-xs font-black text-amber-950">
                          <span className="flex items-center gap-1.5">
                            <Mic className="w-4 h-4 text-rose-500" />
                            <span>Đến lượt em nói theo câu trả lời thật to!</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-amber-400 text-amber-950">
                            {patternRepeatCountdown}s
                          </span>
                        </div>
                        <div className="w-full bg-amber-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-600 h-full transition-all duration-1000 ease-linear rounded-full"
                            style={{ width: `${(patternRepeatCountdown / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions: Listen & Practice Repeat */}
                  <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handlePlayPattern(getAppliedAnswer(sentencePattern, selectedPatternWord), true)}
                      disabled={playingPatternText === getAppliedAnswer(sentencePattern, selectedPatternWord) || isPlayingFullQA}
                      className="w-full sm:w-auto px-5 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>
                        {playingPatternText === getAppliedAnswer(sentencePattern, selectedPatternWord)
                          ? 'Đang phát âm...'
                          : `Nghe Trả Lời & Nói Theo: "${getAppliedAnswer(sentencePattern, selectedPatternWord)}"`}
                      </span>
                    </button>

                    <button
                      onClick={() => handlePlayFullQAPattern(sentencePattern.questionEn, getAppliedAnswer(sentencePattern, selectedPatternWord))}
                      disabled={isPlayingFullQA || playingPatternText !== null}
                      className="w-full sm:w-auto px-5 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>{isPlayingFullQA ? 'Đang phát hội thoại...' : 'Nghe Cả Hỏi & Đáp'}</span>
                    </button>

                    <button
                      onClick={() => {
                        SoundFX.playWordCompleteChime();
                        setPatternStudentSpoken(true);
                        setPatternRepeatCountdown(0);
                        if (patternRepeatTimerRef.current) clearInterval(patternRepeatTimerRef.current);
                      }}
                      className={`w-full sm:w-auto px-5 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 ${
                        patternStudentSpoken
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-400 hover:bg-amber-300 text-amber-950'
                      }`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      <span>{patternStudentSpoken ? 'Bé Đã Nhắc Lại Rất Tốt! ⭐' : 'Em Đã Nói Theo Xong!'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Classroom Teaching Tip */}
              <div className="p-4 bg-sky-50 rounded-2xl border border-sky-200 text-xs text-sky-900 flex items-center gap-3">
                <span className="text-2xl">💡</span>
                <div>
                  <strong className="font-black">Gợi ý thực hành trên lớp học:</strong> Thầy cô mở phát thanh cho học sinh nghe câu hỏi từ Thầy David, sau đó cầm đồ vật (hoặc chỉ vào tranh) và cho cả lớp hô to câu trả lời!
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-50 rounded-2xl text-center text-slate-500 text-sm font-medium">
              Chưa có mẫu câu cho chủ đề này.
            </div>
          )}
        </div>
      )}

      {/* --- ACTIVITY 4: LISTEN & REPEAT CHALLENGE --- */}
      {activeActivity === 'repeat' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black uppercase tracking-wider mb-2">
                <Mic className="w-3.5 h-3.5 text-emerald-600" />
                <span>Phần 4: Luyện Phát Âm Chuẩn Sư Phạm</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-800">
                Thử Thách: Nghe và Nhắc Lại Thật To! (Listen & Repeat)
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                Giáo viên phát âm sạch từ vựng (ví dụ: <span className="font-bold text-slate-700">"Hello."</span>), sau đó vang lên tiếng chuông báo hiệu dịu nhẹ và khoảng lặng để học sinh nhắc lại to rõ ràng, rồi chuyển tiếp êm ái sang từ tiếp theo!
              </p>
            </div>

            {/* Whole classroom repeat sequence player */}
            <button
              onClick={handleToggleRepeatSequence}
              className={`px-5 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 ${
                isPlayingRepeatSequence
                  ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 shadow-md'
              }`}
            >
              {isPlayingRepeatSequence ? (
                <>
                  <Pause className="w-4 h-4 fill-white" />
                  <span>Dừng Chuỗi Luyện Toàn Lớp</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Bật Chuỗi Luyện Cho Cả Lớp (5s nghỉ)</span>
                </>
              )}
            </button>
          </div>

          {/* Classroom playback notice banner */}
          {isPlayingRepeatSequence && (
            <div className="p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-300 flex items-center justify-between gap-3 text-emerald-900 animate-fadeIn">
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-bounce">🎵</span>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Đang phát Phần 4 (Chuỗi Luyện Phát Âm)</div>
                  <div className="text-sm font-bold">
                    Thầy David đọc từ vựng ➔ Chuông báo hiệu dịu nhẹ ➔ Nghỉ cho cả lớp đồng thanh nhắc lại ➔ Nhạc chuyển tiếp êm ái!
                  </div>
                </div>
              </div>
              {currentEpisode.id === 'demo-greetings-01' && (
                <div className="text-xs font-black bg-emerald-200/70 px-3 py-1.5 rounded-xl shrink-0">
                  {formatTime(repeatSequenceTime)} / {formatTime(repeatSequenceDuration || 41)}
                </div>
              )}
            </div>
          )}

          {/* Cards for each word */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {words.map((word) => {
              const isDone = repeatedWordIds.includes(word.id);
              const isPlayingThisWord = playingWordId === word.id;
              const isRepeatingThisWord = activeRepeatingWordId === word.id;

              return (
                <div
                  key={word.id}
                  className={`p-6 rounded-3xl border-2 transition-all flex flex-col justify-between ${
                    isRepeatingThisWord
                      ? 'bg-amber-50/80 border-amber-400 ring-4 ring-amber-100 shadow-md scale-102'
                      : isPlayingThisWord
                      ? 'bg-sky-50/80 border-sky-400 ring-4 ring-sky-100 shadow-md'
                      : isDone
                      ? 'bg-emerald-50/60 border-emerald-300 ring-2 ring-emerald-100'
                      : 'bg-white border-slate-200 hover:border-sky-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-4xl">{word.icon}</span>
                      {isDone && (
                        <span className="flex items-center gap-1 text-xs font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Đã Hoàn Thành!</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 mb-5">
                      <h4 className="text-2xl font-black text-slate-900">{word.english}</h4>
                      <p className="text-sm font-bold text-slate-500">{word.vietnamese}</p>
                    </div>

                    {/* Active student repetition countdown */}
                    {isRepeatingThisWord && (
                      <div className="mb-4 p-3 bg-amber-100/90 border border-amber-300 rounded-2xl text-center space-y-1.5 animate-pulse">
                        <div className="text-xs font-black uppercase text-amber-900 flex items-center justify-center gap-1.5">
                          <Mic className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                          <span>Đến lượt em nhắc lại: {wordRepeatCountdown}s!</span>
                        </div>
                        <div className="w-full bg-amber-200 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-amber-600 h-full transition-all duration-1000 ease-linear rounded-full"
                            style={{ width: `${(wordRepeatCountdown / 5) * 100}%` }}
                          />
                        </div>
                        <p className="text-[11px] font-bold text-amber-800">
                          Hô to: "{word.english}"!
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => handlePlayWord(word)}
                      disabled={isPlayingThisWord}
                      className="w-full py-2.5 px-4 bg-sky-100 hover:bg-sky-200 disabled:opacity-50 text-sky-900 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>{isPlayingThisWord ? 'Đang đọc...' : '1. Nghe Thầy Đọc Mẫu (5s nhắc lại)'}</span>
                    </button>

                    <button
                      onClick={() => handleStudentRepeatCheck(word.id)}
                      className={`w-full py-2.5 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : 'bg-amber-400 hover:bg-amber-500 text-amber-950 shadow-xs'
                      }`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      <span>{isDone ? 'Em Đã Nói Chuẩn! ⭐' : '2. Em Đã Nhắc Lại Xong!'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Educational pedagogical note */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 flex items-center gap-3">
            <span className="text-xl">🎶</span>
            <div>
              <strong className="font-bold text-slate-900">Quy tắc sư phạm & âm thanh chuyển tiếp:</strong> Đoạn phát thanh Phần 4 chỉ đọc từ vựng tiếng Anh sạch (không chứa tiền tố "David" hay số đếm "Number 1, 2, 3"), kèm tiếng chuông celesta êm ái báo hiệu lượt nhắc lại và nhạc chuyển tiếp nhẹ nhàng giữa các từ vựng.
            </div>
          </div>
        </div>
      )}

      {/* --- ACTIVITY 4: INTERACTIVE QUIZ GAME --- */}
      {activeActivity === 'quiz' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-800">Trò Chơi: Đố Vui Tiếng Anh Vui Nhộn</h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Nghe từ tiếng Anh hoặc nhìn hình ảnh và chọn đáp án chính xác nhất để nhận ngôi sao!
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 px-3.5 py-1.5 rounded-2xl border border-amber-200">
              <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
              <span className="text-sm font-black text-amber-900">
                Điểm của em: {quizScore} / {words.length}
              </span>
            </div>
          </div>

          {currentQuizIndex < words.length ? (
            <div className="max-w-2xl mx-auto bg-sky-50/50 border border-sky-100 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="text-center space-y-2">
                <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
                  Câu hỏi số {currentQuizIndex + 1} / {words.length}
                </span>
                <div className="text-5xl">{currentWord.icon}</div>
                <h4 className="text-xl font-black text-slate-800">
                  Từ tiếng Anh nào có nghĩa là: "{currentWord.vietnamese}"?
                </h4>
                <button
                  onClick={() => handlePlayWord(currentWord)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-700 bg-white px-3 py-1.5 rounded-xl border border-sky-200 shadow-2xs cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Bấm để nghe gợi ý âm thanh</span>
                </button>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {words.map((optWord, optIdx) => {
                  const isCorrectAnswer = optWord.id === currentWord.id;
                  const isSelected = selectedQuizOption === optIdx;

                  let optClass = 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800';
                  if (quizSubmitted) {
                    if (isCorrectAnswer) {
                      optClass = 'bg-emerald-500 text-white border-emerald-600 shadow-md font-black';
                    } else if (isSelected && !isCorrectAnswer) {
                      optClass = 'bg-rose-500 text-white border-rose-600';
                    } else {
                      optClass = 'bg-white opacity-40 border-slate-200';
                    }
                  }

                  return (
                    <button
                      key={optWord.id}
                      disabled={quizSubmitted}
                      onClick={() => handleSelectQuizAnswer(isCorrectAnswer, optIdx)}
                      className={`p-4 rounded-2xl border text-center transition-all cursor-pointer font-extrabold text-base flex flex-col items-center gap-1 ${optClass}`}
                    >
                      <span className="text-2xl">{optWord.icon}</span>
                      <span>{optWord.english}</span>
                    </button>
                  );
                })}
              </div>

              {/* Next Question / Feedback Button */}
              {quizSubmitted && (
                <div className="flex items-center justify-between pt-4 border-t border-sky-200/60">
                  <div className="text-sm font-black text-slate-700">
                    {selectedQuizOption !== null && words[selectedQuizOption]?.id === currentWord.id ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Chính xác tuyệt vời! +1 Ngôi sao ⭐</span>
                      </span>
                    ) : (
                      <span className="text-rose-600">
                        Cố gắng lên nhé! Đáp án đúng là {currentWord.english}.
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleNextQuizQuestion}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-black rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>Câu Tiếp Theo</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-md mx-auto text-center p-8 bg-amber-50 border border-amber-200 rounded-3xl space-y-4">
              <span className="text-6xl">🏆</span>
              <h4 className="text-2xl font-black text-amber-950">Hoàn Thành Xuất Sắc!</h4>
              <p className="text-sm text-amber-800 font-medium">
                Em đã đạt được <strong className="font-black">{quizScore} / {words.length}</strong> ngôi sao may mắn trong bài học hôm nay!
              </p>
              <button
                onClick={() => {
                  setCurrentQuizIndex(0);
                  setSelectedQuizOption(null);
                  setQuizSubmitted(false);
                  setQuizScore(0);
                }}
                className="px-6 py-3 bg-amber-400 hover:bg-amber-500 text-amber-950 font-black text-sm rounded-2xl shadow-sm transition-all cursor-pointer"
              >
                Chơi Lại Từ Đầu
              </button>
            </div>
          )}
        </div>
      )}

      {/* Daily Speaking Challenge Card */}
      <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 rounded-3xl p-6 text-amber-950 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/30 backdrop-blur flex items-center justify-center text-3xl shrink-0">
            🎯
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-amber-900/80">
              Nhiệm Vụ Nói Tiếng Anh Hôm Nay (Daily Speaking Challenge):
            </div>
            <div className="text-base sm:text-lg font-black mt-0.5">
              "Hãy vẫy tay và nói <strong>{words[0]?.english || 'Hello'}</strong> với ít nhất 3 bạn trong lớp học của mình nhé!"
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            SoundFX.playApplause();
            setPatternStudentSpoken(true);
          }}
          className="self-start sm:self-center px-5 py-2.5 bg-white hover:bg-amber-50 text-amber-950 text-xs sm:text-sm font-black rounded-2xl shadow-sm transition-all active:scale-95 cursor-pointer whitespace-nowrap"
        >
          ✓ Em Sẽ Làm Được!
        </button>
      </div>
    </div>
  );
};

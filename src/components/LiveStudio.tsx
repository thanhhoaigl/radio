import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, MicOff, Play, Pause, RotateCcw, Volume2, Sparkles, 
  VolumeX, Download, Bell, ThumbsUp, Clock, Music, 
  Radio, CheckCircle2, ChevronRight, FastForward, Award
} from 'lucide-react';
import { RadioEpisode, ScriptSegment, VocabWord } from '../types/radio';
import { 
  SoundFX, startBackgroundMusic, stopBackgroundMusic, 
  setBackgroundMusicVolume, getAudioContext,
  attachRecordingDestination, detachRecordingDestination,
  playAudioUrlThroughMix, MixAudioPlaybackHandle
} from '../utils/audioSynthesizer';

interface LiveStudioProps {
  currentEpisode: RadioEpisode;
  onSelectWordForTTS?: (word: string) => void;
}

export const LiveStudio: React.FC<LiveStudioProps> = ({ currentEpisode }) => {
  // Teleprompter typography scale: 'normal' | 'large' | 'huge'
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'huge'>('large');
  
  // Current active script index in teleprompter
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(0);

  // Background Music state
  const [bgmActive, setBgmActive] = useState<boolean>(false);
  const [bgmVolume, setBgmVolume] = useState<number>(0.15);

  // Live Microphone + Studio Mix Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedFileExt, setRecordedFileExt] = useState<'webm' | 'm4a'>('webm');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micHighpassRef = useRef<BiquadFilterNode | null>(null);
  const micDelayRef = useRef<DelayNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordedAudioUrlRef = useRef<string | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const micRestoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPauseDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMicMuteAtRef = useRef<number>(0);

  // Speech TTS playing state
  const [playingTTSId, setPlayingTTSId] = useState<string | null>(null);
  const activePlaybackRef = useRef<MixAudioPlaybackHandle | null>(null);
  const ttsRequestIdRef = useRef<number>(0);

  // Sound effects feedback
  const [activeSfxName, setActiveSfxName] = useState<string | null>(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const muteMicImmediately = () => {
    if (!micGainRef.current) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    micGainRef.current.gain.cancelScheduledValues(now);
    micGainRef.current.gain.setValueAtTime(micGainRef.current.gain.value, now);
    micGainRef.current.gain.linearRampToValueAtTime(0, now + 0.005);
    lastMicMuteAtRef.current = performance.now();
  };

  // Called on pointerDown / keyDown before mechanical click occurs; 100ms delay node keeps the click out of mixDest
  const beginMicClickSuppression = () => {
    if (!isRecordingRef.current || isPausedRef.current || !micGainRef.current) return;
    if (micRestoreTimeoutRef.current) {
      clearTimeout(micRestoreTimeoutRef.current);
      micRestoreTimeoutRef.current = null;
    }
    muteMicImmediately();
    // Safety restore in case user presses down and drags away without firing click
    micRestoreTimeoutRef.current = setTimeout(() => {
      micRestoreTimeoutRef.current = null;
      if (isRecordingRef.current && !isPausedRef.current && micGainRef.current) {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        micGainRef.current.gain.cancelScheduledValues(now);
        micGainRef.current.gain.setValueAtTime(0, now);
        micGainRef.current.gain.linearRampToValueAtTime(1.0, now + 0.035);
      }
    }, 450);
  };

  // Called inside onClick handlers (Soundboard, BGM, TTS, Teleprompter) to wait out mouse-release click then restore mic
  const finishMicClickSuppression = (holdMs = 150) => {
    if (!isRecordingRef.current || isPausedRef.current || !micGainRef.current) return;
    if (micRestoreTimeoutRef.current) {
      clearTimeout(micRestoreTimeoutRef.current);
      micRestoreTimeoutRef.current = null;
    }
    muteMicImmediately();
    micRestoreTimeoutRef.current = setTimeout(() => {
      micRestoreTimeoutRef.current = null;
      if (isRecordingRef.current && !isPausedRef.current && micGainRef.current) {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        micGainRef.current.gain.cancelScheduledValues(now);
        micGainRef.current.gain.setValueAtTime(0, now);
        micGainRef.current.gain.linearRampToValueAtTime(1.0, now + 0.035);
      }
    }, holdMs);
  };

  const handleSuppressKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      beginMicClickSuppression();
    }
  };

  const cleanupRecordingGraph = () => {
    detachRecordingDestination();
    if (micRestoreTimeoutRef.current) {
      clearTimeout(micRestoreTimeoutRef.current);
      micRestoreTimeoutRef.current = null;
    }
    if (stopPauseDelayTimeoutRef.current) {
      clearTimeout(stopPauseDelayTimeoutRef.current);
      stopPauseDelayTimeoutRef.current = null;
    }
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch {}
      micSourceRef.current = null;
    }
    if (micHighpassRef.current) {
      try { micHighpassRef.current.disconnect(); } catch {}
      micHighpassRef.current = null;
    }
    if (micDelayRef.current) {
      try { micDelayRef.current.disconnect(); } catch {}
      micDelayRef.current = null;
    }
    if (micGainRef.current) {
      try { micGainRef.current.disconnect(); } catch {}
      micGainRef.current = null;
    }
    if (mixDestRef.current) {
      try { mixDestRef.current.disconnect(); } catch {}
      mixDestRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
  };

  // Stop recording and clean up audio resources on unmount
  useEffect(() => {
    return () => {
      stopBackgroundMusic();
      activePlaybackRef.current?.stop();
      activePlaybackRef.current = null;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      cleanupRecordingGraph();
      if (recordedAudioUrlRef.current) {
        URL.revokeObjectURL(recordedAudioUrlRef.current);
      }
    };
  }, []);

  const triggerSfxNotice = (name: string) => {
    setActiveSfxName(name);
    setTimeout(() => setActiveSfxName(null), 1200);
  };

  // Soundboard handlers (routed through shared mix bus; mic is ducked briefly on click so mouse clicks aren't recorded)
  const handlePlayIntro = async () => {
    finishMicClickSuppression(160);
    triggerSfxNotice('Nhạc hiệu mở đài radio');
    try {
      await playAudioUrlThroughMix('/audio/radio_intro_jingle.wav', { volume: 0.75 });
    } catch {
      SoundFX.playIntroJingle();
    }
  };

  const handlePlayApplause = () => {
    finishMicClickSuppression(160);
    SoundFX.playApplause();
    triggerSfxNotice('Vỗ tay');
  };

  const handlePlayCorrect = () => {
    finishMicClickSuppression(160);
    SoundFX.playCorrect();
    triggerSfxNotice('Chuông đúng');
  };

  const handlePlayTick = () => {
    finishMicClickSuppression(160);
    SoundFX.playTick();
    triggerSfxNotice('Đồng hồ tích tắc');
  };

  const handlePlayOutro = () => {
    finishMicClickSuppression(160);
    SoundFX.playOutro();
    triggerSfxNotice('Nhạc kết thúc');
  };

  const toggleBgm = () => {
    finishMicClickSuppression(160);
    if (bgmActive) {
      stopBackgroundMusic();
      setBgmActive(false);
    } else {
      startBackgroundMusic(bgmVolume);
      setBgmActive(true);
    }
  };

  const handleBgmVolumeChange = (newVol: number) => {
    finishMicClickSuppression(160);
    setBgmVolume(newVol);
    setBackgroundMusicVolume(newVol);
  };

  // Play native pronunciation for a word or segment (also captured into live recording mix)
  const handlePlayNativeAudio = async (text: string, language: 'en' | 'vi', segmentId?: string) => {
    finishMicClickSuppression(160);
    const reqId = ++ttsRequestIdRef.current;
    if (activePlaybackRef.current) {
      activePlaybackRef.current.stop();
      activePlaybackRef.current = null;
    }
    setPlayingTTSId(segmentId || text);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: language === 'vi' ? currentEpisode.voiceVi : currentEpisode.voiceEn,
          language,
        }),
      });

      const data = await res.json();
      if (reqId !== ttsRequestIdRef.current) return;

      if (data.audioBase64) {
        const handle = await playAudioUrlThroughMix(`data:audio/wav;base64,${data.audioBase64}`, {
          volume: 1.0,
          onEnded: () => {
            if (reqId === ttsRequestIdRef.current) {
              setPlayingTTSId(null);
              activePlaybackRef.current = null;
            }
          },
        });
        if (reqId !== ttsRequestIdRef.current) {
          handle.stop();
          return;
        }
        activePlaybackRef.current = handle;
      } else {
        triggerSfxNotice(data.error || 'Lỗi tạo âm thanh AI');
        setPlayingTTSId(null);
      }
    } catch {
      if (reqId === ttsRequestIdRef.current) {
        triggerSfxNotice('Lỗi kết nối âm thanh AI');
        setPlayingTTSId(null);
      }
    }
  };

  // Microphone + Soundboard/BGM/AI studio mix recording
  const startRecording = async () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = micStream;

      // Build mix destination: Mic -> Highpass (cuts desk thumps) -> 100ms lookahead delay -> MicGain -> MixDest
      const mixDest = ctx.createMediaStreamDestination();
      const micSource = ctx.createMediaStreamSource(micStream);
      const micHighpass = ctx.createBiquadFilter();
      micHighpass.type = 'highpass';
      micHighpass.frequency.setValueAtTime(95, ctx.currentTime);

      const micDelay = ctx.createDelay(0.5);
      micDelay.delayTime.setValueAtTime(0.1, ctx.currentTime);

      const micGain = ctx.createGain();
      // Keep mic muted for 220ms on start so clicking "Bắt Đầu Ghi Âm" is not captured
      micGain.gain.setValueAtTime(0, ctx.currentTime);
      micGain.gain.setValueAtTime(0, ctx.currentTime + 0.22);
      micGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.27);

      micSource.connect(micHighpass);
      micHighpass.connect(micDelay);
      micDelay.connect(micGain);
      micGain.connect(mixDest);

      micSourceRef.current = micSource;
      micHighpassRef.current = micHighpass;
      micDelayRef.current = micDelay;
      micGainRef.current = micGain;
      mixDestRef.current = mixDest;

      attachRecordingDestination(mixDest);

      audioChunksRef.current = [];
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const supportedMimeType =
        typeof MediaRecorder !== 'undefined'
          ? preferredTypes.find((type) => MediaRecorder.isTypeSupported(type))
          : undefined;

      const mediaRecorder = supportedMimeType
        ? new MediaRecorder(mixDest.stream, { mimeType: supportedMimeType })
        : new MediaRecorder(mixDest.stream);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || supportedMimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (recordedAudioUrlRef.current) {
          URL.revokeObjectURL(recordedAudioUrlRef.current);
        }
        const url = URL.createObjectURL(audioBlob);
        recordedAudioUrlRef.current = url;
        setRecordedFileExt(mimeType.includes('mp4') ? 'm4a' : 'webm');
        setRecordedAudioUrl(url);
        cleanupRecordingGraph();
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setIsPaused(false);
      isRecordingRef.current = true;
      isPausedRef.current = false;
      setRecordingSeconds(0);

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      cleanupRecordingGraph();
      triggerSfxNotice('Vui lòng cấp quyền Micro');
    }
  };

  const pauseRecording = () => {
    if (!mediaRecorderRef.current || !isRecordingRef.current || isPausedRef.current) return;
    if (micRestoreTimeoutRef.current) {
      clearTimeout(micRestoreTimeoutRef.current);
      micRestoreTimeoutRef.current = null;
    }
    const elapsedSinceMute = performance.now() - lastMicMuteAtRef.current;
    muteMicImmediately();
    detachRecordingDestination();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsPaused(true);
    isPausedRef.current = true;
    triggerSfxNotice('Tạm dừng thu âm — nghe mẫu & luyện đọc nhé');

    const finalizePause = () => {
      stopPauseDelayTimeoutRef.current = null;
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === 'recording' &&
        typeof mediaRecorderRef.current.pause === 'function'
      ) {
        mediaRecorderRef.current.pause();
      }
    };

    // Allow remaining pre-click speech in the 100ms delay buffer to finish cleanly before pausing
    const waitMs = Math.max(0, 90 - elapsedSinceMute);
    if (waitMs > 0) {
      stopPauseDelayTimeoutRef.current = setTimeout(finalizePause, waitMs);
    } else {
      finalizePause();
    }
  };

  const resumeRecording = async () => {
    if (!mediaRecorderRef.current || !isRecordingRef.current || !isPausedRef.current) return;
    if (stopPauseDelayTimeoutRef.current) {
      clearTimeout(stopPauseDelayTimeoutRef.current);
      stopPauseDelayTimeoutRef.current = null;
    }
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (micGainRef.current) {
      // Keep mic muted for 220ms after clicking "Thu Âm Tiếp" so the mouse click isn't captured
      const now = ctx.currentTime;
      micGainRef.current.gain.cancelScheduledValues(now);
      micGainRef.current.gain.setValueAtTime(0, now);
      micGainRef.current.gain.setValueAtTime(0, now + 0.22);
      micGainRef.current.gain.linearRampToValueAtTime(1.0, now + 0.27);
    }
    if (mixDestRef.current) {
      attachRecordingDestination(mixDestRef.current);
    }
    if (
      mediaRecorderRef.current.state === 'paused' &&
      typeof mediaRecorderRef.current.resume === 'function'
    ) {
      mediaRecorderRef.current.resume();
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    timerIntervalRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    setIsPaused(false);
    isPausedRef.current = false;
    triggerSfxNotice('Tiếp tục thu âm');
  };

  const stopRecording = () => {
    const recorderToStop = mediaRecorderRef.current;
    if (!recorderToStop || !isRecordingRef.current) return;
    mediaRecorderRef.current = null;
    if (micRestoreTimeoutRef.current) {
      clearTimeout(micRestoreTimeoutRef.current);
      micRestoreTimeoutRef.current = null;
    }
    if (stopPauseDelayTimeoutRef.current) {
      clearTimeout(stopPauseDelayTimeoutRef.current);
      stopPauseDelayTimeoutRef.current = null;
    }
    const elapsedSinceMute = performance.now() - lastMicMuteAtRef.current;
    const wasPaused = isPausedRef.current;
    muteMicImmediately();
    detachRecordingDestination();
    setIsRecording(false);
    setIsPaused(false);
    isRecordingRef.current = false;
    isPausedRef.current = false;
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const finalizeStop = () => {
      stopPauseDelayTimeoutRef.current = null;
      if (recorderToStop.state !== 'inactive') {
        recorderToStop.stop();
      }
    };

    const waitMs = wasPaused ? 0 : Math.max(0, 90 - elapsedSinceMute);
    if (waitMs > 0) {
      stopPauseDelayTimeoutRef.current = setTimeout(finalizeStop, waitMs);
    } else {
      finalizeStop();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const segments = currentEpisode.segments || [];

  return (
    <div className="space-y-6">
      {/* Studio Banner & Mode Indicator */}
      <div className="bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-black uppercase tracking-wider">
                <Radio className="w-3.5 h-3.5 animate-pulse text-amber-200" />
                <span>Phòng Thu Trực Tiếp · Live MC Studio</span>
              </span>
              {activeSfxName && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-xs font-extrabold animate-bounce">
                  🔔 {activeSfxName}
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Phòng Phát Thanh Học Sinh & Giáo Viên
            </h2>
            <p className="text-sm text-pink-100 max-w-2xl font-medium">
              Học sinh tự tin làm phát thanh viên MC nhí! Các em đọc lời thoại tiếng Việt dễ hiểu, và bấm nút để AI phát âm tiếng Anh chuẩn bản ngữ hỗ trợ bất cứ lúc nào.
            </p>
          </div>

          {/* Teleprompter Font Size Controls */}
          <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-2xl self-start md:self-center">
            <span className="text-xs font-bold text-pink-100 px-2">Cỡ chữ:</span>
            <button
              onPointerDown={beginMicClickSuppression}
              onKeyDown={handleSuppressKeyDown}
              onClick={() => {
                finishMicClickSuppression(140);
                setFontSize('normal');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                fontSize === 'normal' ? 'bg-white text-slate-800 shadow-sm' : 'text-white/80 hover:text-white'
              }`}
            >
              Vừa
            </button>
            <button
              onPointerDown={beginMicClickSuppression}
              onKeyDown={handleSuppressKeyDown}
              onClick={() => {
                finishMicClickSuppression(140);
                setFontSize('large');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                fontSize === 'large' ? 'bg-white text-slate-800 shadow-sm' : 'text-white/80 hover:text-white'
              }`}
            >
              To
            </button>
            <button
              onPointerDown={beginMicClickSuppression}
              onKeyDown={handleSuppressKeyDown}
              onClick={() => {
                finishMicClickSuppression(140);
                setFontSize('huge');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                fontSize === 'huge' ? 'bg-white text-slate-800 shadow-sm' : 'text-white/80 hover:text-white'
              }`}
            >
              Rất To
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Teleprompter Console (Left) + Soundboard & Audio Controls (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Teleprompter for student presenters (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
                <h3 className="text-base font-extrabold text-slate-800">
                  Kịch Bản Phát Thanh (MC Teleprompter)
                </h3>
              </div>
              <div className="text-xs font-bold text-slate-500">
                Đoạn {activeSegmentIndex + 1} / {segments.length}
              </div>
            </div>

            {/* Sentence Pattern Quick Reference for Presenters */}
            {currentEpisode.sentencePattern && (
              <div className="mb-4 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-amber-900 uppercase tracking-wider text-[10px]">
                    <span>✨ Mẫu Câu Trọng Tâm Của Buổi Phát Thanh:</span>
                  </div>
                  <div className="font-extrabold text-slate-800 flex items-center gap-2 flex-wrap">
                    <span className="text-sky-700">❓ {currentEpisode.sentencePattern.questionEn}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-emerald-700">💬 {currentEpisode.sentencePattern.answerPatternEn || currentEpisode.sentencePattern.answerExampleEn}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {currentEpisode.sentencePattern.guideVi}
                  </div>
                </div>
                <button
                  onPointerDown={beginMicClickSuppression}
                  onKeyDown={handleSuppressKeyDown}
                  onClick={() => handlePlayNativeAudio(currentEpisode.sentencePattern!.questionEn, 'en', 'sp-question')}
                  className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs rounded-xl shadow-2xs shrink-0 cursor-pointer flex items-center gap-1"
                  title="Nghe phát âm mẫu câu"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-700" />
                  <span>Nghe</span>
                </button>
              </div>
            )}

            {/* Segment Cards List */}
            <div className="space-y-4 max-h-[620px] overflow-y-auto pr-2 scrollbar-thin">
              {segments.map((seg, idx) => {
                const isActive = activeSegmentIndex === idx;
                const isEnglish = seg.language === 'en';
                const isPlayingThis = playingTTSId === seg.id || playingTTSId === seg.spokenText;

                return (
                  <div
                    key={seg.id}
                    onPointerDown={beginMicClickSuppression}
                    onClick={() => {
                      finishMicClickSuppression(140);
                      setActiveSegmentIndex(idx);
                    }}
                    className={`rounded-2xl p-4 sm:p-5 transition-all cursor-pointer border ${
                      isActive
                        ? 'border-rose-400 bg-rose-50/40 ring-2 ring-rose-200/60 shadow-md'
                        : isEnglish
                        ? 'border-emerald-200/80 bg-emerald-50/30 hover:border-emerald-300'
                        : 'border-sky-200/80 bg-sky-50/30 hover:border-sky-300'
                    }`}
                  >
                    {/* Header of Segment */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-lg ${
                            isEnglish
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {seg.speakerName}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {seg.partNameVi}
                        </span>
                        {seg.startSeconds !== undefined && (
                          <span className="text-[10px] font-mono font-bold text-slate-500 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
                            ⏱️ {Math.floor(seg.startSeconds / 60).toString().padStart(2, '0')}:{(Math.floor(seg.startSeconds % 60)).toString().padStart(2, '0')}
                          </span>
                        )}
                      </div>

                      {/* Play native audio button */}
                      <button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          beginMicClickSuppression();
                        }}
                        onKeyDown={handleSuppressKeyDown}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayNativeAudio(seg.spokenText, seg.language, seg.id);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                          isPlayingThis
                            ? 'bg-rose-500 text-white animate-pulse'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
                        }`}
                        title="Bấm để phát âm giọng mẫu"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-sky-500" />
                        <span>{isPlayingThis ? 'Đang phát...' : 'Phát giọng AI'}</span>
                      </button>
                    </div>

                    {/* Spoken Text (Large, high legibility for kids) */}
                    <div
                      className={`font-black text-slate-900 leading-relaxed ${
                        fontSize === 'huge'
                          ? 'text-2xl sm:text-3xl'
                          : fontSize === 'large'
                          ? 'text-xl sm:text-2xl'
                          : 'text-base sm:text-lg'
                      }`}
                    >
                      {seg.spokenText}
                    </div>

                    {/* Vietnamese guide text */}
                    {seg.textVi && seg.language === 'en' && (
                      <div className="mt-2 text-xs sm:text-sm font-semibold text-slate-600 bg-white/70 p-2 rounded-xl border border-emerald-100">
                        💡 Nghĩa tiếng Việt: {seg.textVi}
                      </div>
                    )}

                    {seg.silenceSecondsAfter && seg.silenceSecondsAfter > 0 && (
                      <div className="mt-2.5 flex items-center gap-2 text-xs font-bold text-amber-700">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Khoảng lặng cho học sinh nhắc lại: {seg.silenceSecondsAfter} giây</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Teleprompter Nav Buttons */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
              <button
                disabled={activeSegmentIndex === 0}
                onPointerDown={beginMicClickSuppression}
                onKeyDown={handleSuppressKeyDown}
                onClick={() => {
                  finishMicClickSuppression(140);
                  setActiveSegmentIndex((prev) => Math.max(0, prev - 1));
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                ← Đoạn trước
              </button>
              <span className="text-xs font-extrabold text-slate-600">
                Chuyển câu tiếp theo khi học sinh đọc xong
              </span>
              <button
                disabled={activeSegmentIndex >= segments.length - 1}
                onPointerDown={beginMicClickSuppression}
                onKeyDown={handleSuppressKeyDown}
                onClick={() => {
                  finishMicClickSuppression(140);
                  setActiveSegmentIndex((prev) => Math.min(segments.length - 1, prev + 1));
                }}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>Đoạn tiếp theo</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Soundboard & Mic Controls & Quick Vocab Trigger (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Live Soundboard */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <Music className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-slate-800">
                  Bàn Hiệu Ứng Âm Thanh (Soundboard)
                </h3>
              </div>
              {isRecording && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-black shrink-0 ${
                    isPaused
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isPaused ? 'bg-amber-500' : 'bg-rose-500 animate-ping'
                    }`}
                  />
                  {isPaused ? 'Đang tạm dừng thu' : 'Đang thu cùng Mic'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onPointerDown={beginMicClickSuppression}
                onKeyDown={handleSuppressKeyDown}
                onClick={handlePlayIntro}
                className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-200 rounded-2xl flex flex-col items-center gap-1.5 transition-all active:scale-95 text-center cursor-pointer"
              >
                <span className="text-2xl">🎺</span>
                <span className="text-xs font-extrabold text-amber-900">Nhạc Mở Đầu</span>
                <span className="text-[10px] text-amber-700/80 font-medium">Intro Jingle</span>
              </button>

              <button
                onPointerDown={beginMicClickSuppression}
                onKeyDown={handleSuppressKeyDown}
                onClick={handlePlayApplause}
                className="p-3 bg-gradient-to-br from-rose-50 to-pink-50 hover:from-rose-100 hover:to-pink-100 border border-rose-200 rounded-2xl flex flex-col items-center gap-1.5 transition-all active:scale-95 text-center cursor-pointer"
              >
                <span className="text-2xl">👏</span>
                <span className="text-xs font-extrabold text-rose-900">Tiếng Vỗ Tay</span>
                <span className="text-[10px] text-rose-700/80 font-medium">Applause</span>
              </button>

              <button
                onPointerDown={beginMicClickSuppression}
                onKeyDown={handleSuppressKeyDown}
                onClick={handlePlayCorrect}
                className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-200 rounded-2xl flex flex-col items-center gap-1.5 transition-all active:scale-95 text-center cursor-pointer"
              >
                <span className="text-2xl">🔔</span>
                <span className="text-xs font-extrabold text-emerald-900">Chuông Đúng</span>
                <span className="text-[10px] text-emerald-700/80 font-medium">Ding Dong</span>
              </button>

              <button
                onPointerDown={beginMicClickSuppression}
                onKeyDown={handleSuppressKeyDown}
                onClick={handlePlayTick}
                className="p-3 bg-gradient-to-br from-sky-50 to-blue-50 hover:from-sky-100 hover:to-blue-100 border border-sky-200 rounded-2xl flex flex-col items-center gap-1.5 transition-all active:scale-95 text-center cursor-pointer"
              >
                <span className="text-2xl">⏰</span>
                <span className="text-xs font-extrabold text-sky-900">Đếm Ngược</span>
                <span className="text-[10px] text-sky-700/80 font-medium">Tick-tock</span>
              </button>

              <button
                onPointerDown={beginMicClickSuppression}
                onKeyDown={handleSuppressKeyDown}
                onClick={handlePlayOutro}
                className="col-span-2 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 cursor-pointer"
              >
                <span className="text-xl">🌟</span>
                <div className="text-left">
                  <div className="text-xs font-extrabold text-indigo-950">Nhạc Kết Thúc Chương Trình</div>
                  <div className="text-[10px] text-indigo-700 font-medium">Outro Ending Fanfare</div>
                </div>
              </button>
            </div>

            {/* Background Music Loop toggle & slider */}
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-sky-500" />
                  <span>Nhạc nền êm dịu (BGM Loop):</span>
                </span>
                <button
                  onPointerDown={beginMicClickSuppression}
                  onKeyDown={handleSuppressKeyDown}
                  onClick={toggleBgm}
                  className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                    bgmActive
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {bgmActive ? 'BẬT (Đang phát)' : 'TẮT'}
                </button>
              </div>

              {bgmActive && (
                <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                  <Volume2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="range"
                    min="0.05"
                    max="0.30"
                    step="0.01"
                    value={bgmVolume}
                    onPointerDown={beginMicClickSuppression}
                    onPointerUp={() => finishMicClickSuppression(150)}
                    onChange={(e) => handleBgmVolumeChange(parseFloat(e.target.value))}
                    className="flex-1 accent-sky-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-600 w-10 text-right">
                    {Math.round(bgmVolume * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2. One-Word-At-A-Time Vocabulary Trigger Pad */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Phát Từ Vựng Nhanh (1 chạm)</span>
              </h3>
              <span className="text-[11px] font-bold text-slate-500">Giọng bản ngữ Mỹ</span>
            </div>

            <div className="space-y-2">
              {currentEpisode.targetWords.map((word) => {
                const isPlayingThis = playingTTSId === word.english;
                return (
                  <button
                    key={word.id}
                    onPointerDown={beginMicClickSuppression}
                    onKeyDown={handleSuppressKeyDown}
                    onClick={() => handlePlayNativeAudio(word.english, 'en')}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isPlayingThis
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-md scale-[1.01]'
                        : 'bg-slate-50/80 hover:bg-emerald-50/70 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{word.icon}</span>
                      <div>
                        <div
                          className={`font-black text-sm sm:text-base ${
                            isPlayingThis ? 'text-white' : 'text-slate-800'
                          }`}
                        >
                          {word.english}
                          <span
                            className={`ml-2 text-xs font-normal ${
                              isPlayingThis ? 'text-emerald-100' : 'text-slate-500'
                            }`}
                          >
                            {word.phonetic}
                          </span>
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            isPlayingThis ? 'text-emerald-100' : 'text-slate-500'
                          }`}
                        >
                          {word.vietnamese}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isPlayingThis ? 'bg-white text-emerald-600' : 'bg-white text-slate-600 shadow-2xs'
                      }`}
                    >
                      <Volume2 className="w-4 h-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Live Microphone Recording Booth */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Mic className="w-4 h-4 text-rose-500" />
                <span>Ghi Âm Buổi Phát Sóng Của Học Sinh</span>
              </h3>
              {isRecording && (
                <span
                  className={`flex items-center gap-1.5 text-xs font-black px-2.5 py-0.5 rounded-md ${
                    isPaused
                      ? 'text-amber-800 bg-amber-100'
                      : 'text-rose-600 bg-rose-50 animate-pulse'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isPaused ? 'bg-amber-500' : 'bg-rose-600'
                    }`}
                  ></span>
                  <span>
                    {isPaused ? 'TẠM DỪNG' : 'REC'} {formatTime(recordingSeconds)}
                  </span>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 mb-4 font-medium leading-relaxed">
              Ghi lại giọng đọc của học sinh hòa cùng hiệu ứng âm thanh, nhạc nền và giọng mẫu AI từ phòng thu để nghe lại hoặc chia sẻ cho phụ huynh.
            </p>

            {isRecording && (
              <div
                className={`mb-3 px-3 py-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-2 ${
                  isPaused
                    ? 'bg-sky-50 border-sky-200/80 text-sky-900'
                    : 'bg-amber-50 border-amber-200/80 text-amber-900'
                }`}
              >
                <Sparkles
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isPaused ? 'text-sky-600' : 'text-amber-600'
                  }`}
                />
                <span>
                  {isPaused
                    ? 'Đang tạm dừng thu âm: Học sinh hãy bấm "Phát giọng AI" để nghe Cô Mai & Thầy David đọc mẫu và luyện đọc theo, sau đó bấm "Thu Âm Tiếp"!'
                    : 'Đang thu trực tiếp Micro + Bàn hiệu ứng + Nhạc nền. Các em hãy bấm nút trên Soundboard để chèn âm thanh cho sinh động!'}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2.5">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex-1 py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-rose-200 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Bắt Đầu Ghi Âm</span>
                </button>
              ) : (
                <>
                  {!isPaused ? (
                    <button
                      onPointerDown={beginMicClickSuppression}
                      onPointerCancel={() => finishMicClickSuppression(100)}
                      onPointerLeave={() => {
                        if (isRecordingRef.current && !isPausedRef.current) {
                          finishMicClickSuppression(100);
                        }
                      }}
                      onKeyDown={handleSuppressKeyDown}
                      onClick={pauseRecording}
                      className="flex-1 py-3 px-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-amber-200/70 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <Pause className="w-4 h-4" />
                      <span>Tạm Dừng</span>
                    </button>
                  ) : (
                    <button
                      onClick={resumeRecording}
                      className="flex-1 py-3 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md shadow-emerald-200/70 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                      <span>Thu Âm Tiếp</span>
                    </button>
                  )}
                  <button
                    onPointerDown={beginMicClickSuppression}
                    onPointerCancel={() => finishMicClickSuppression(100)}
                    onPointerLeave={() => {
                      if (isRecordingRef.current && !isPausedRef.current) {
                        finishMicClickSuppression(100);
                      }
                    }}
                    onKeyDown={handleSuppressKeyDown}
                    onClick={stopRecording}
                    className="flex-1 py-3 px-3 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <MicOff className="w-4 h-4 text-rose-400" />
                    <span>Dừng & Lưu</span>
                  </button>
                </>
              )}
            </div>

            {/* Recorded audio player */}
            {recordedAudioUrl && (
              <div className="mt-4 p-3 bg-rose-50/60 rounded-2xl border border-rose-200/60 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-rose-900">
                  <span>🎧 Bản thu âm hoàn thành:</span>
                  <a
                    href={recordedAudioUrl}
                    download={`happy-english-live-${Date.now()}.${recordedFileExt}`}
                    className="flex items-center gap-1 text-rose-600 hover:text-rose-700 font-extrabold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải về</span>
                  </a>
                </div>
                <audio src={recordedAudioUrl} controls className="w-full h-8" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

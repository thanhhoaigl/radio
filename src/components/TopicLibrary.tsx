import React, { useState } from 'react';
import { 
  BookOpen, Plus, Volume2, Sparkles, Check, Edit2, 
  Trash2, X, AlertCircle 
} from 'lucide-react';
import { Topic, VocabWord } from '../types/radio';
import { PRELOADED_TOPICS } from '../data/topics';

interface TopicLibraryProps {
  topics: Topic[];
  onUpdateTopics: (topics: Topic[]) => void;
  onSelectTopicForEpisode?: (topic: Topic) => void;
}

export const TopicLibrary: React.FC<TopicLibraryProps> = ({ 
  topics, 
  onUpdateTopics,
  onSelectTopicForEpisode 
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string>(topics[0]?.id || 'greetings');
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);
  const [playingPatternText, setPlayingPatternText] = useState<string | null>(null);

  // Custom Topic creation modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTopicVi, setNewTopicVi] = useState('');
  const [newTopicEn, setNewTopicEn] = useState('');
  const [newTopicIcon, setNewTopicIcon] = useState('🎒');
  const [newTopicDesc, setNewTopicDesc] = useState('');

  // New word for current topic modal
  const [isAddWordModalOpen, setIsAddWordModalOpen] = useState(false);
  const [newEnglish, setNewEnglish] = useState('');
  const [newVietnamese, setNewVietnamese] = useState('');
  const [newPhonetic, setNewPhonetic] = useState('');
  const [newIcon, setNewIcon] = useState('✨');
  const [newExEn, setNewExEn] = useState('');
  const [newExVi, setNewExVi] = useState('');

  const currentTopic = topics.find((t) => t.id === selectedTopicId) || topics[0];

  // Play audio for a word
  const handlePlayWord = async (word: VocabWord) => {
    setPlayingWordId(word.id);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: word.english,
          voice: 'Puck',
          language: 'en',
        }),
      });
      const data = await res.json();
      const audioSrc = data.audioUrl || (data.audioBase64 ? `data:audio/wav;base64,${data.audioBase64}` : null);
      if (audioSrc) {
        const audio = new Audio(audioSrc);
        audio.onended = () => setPlayingWordId(null);
        audio.onerror = () => setPlayingWordId(null);
        await audio.play();
      } else {
        setPlayingWordId(null);
      }
    } catch {
      setPlayingWordId(null);
    }
  };

  // Play sentence pattern audio
  const handlePlayPattern = async (text: string) => {
    setPlayingPatternText(text);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: 'Puck',
          language: 'en',
        }),
      });
      const data = await res.json();
      const audioSrc = data.audioUrl || (data.audioBase64 ? `data:audio/wav;base64,${data.audioBase64}` : null);
      if (audioSrc) {
        const audio = new Audio(audioSrc);
        audio.onended = () => setPlayingPatternText(null);
        audio.onerror = () => setPlayingPatternText(null);
        await audio.play();
      } else {
        setPlayingPatternText(null);
      }
    } catch {
      setPlayingPatternText(null);
    }
  };

  // Add custom topic
  const handleCreateTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicVi.trim() || !newTopicEn.trim()) return;

    const newTopic: Topic = {
      id: `topic-${Date.now()}`,
      titleVi: newTopicVi.trim(),
      titleEn: newTopicEn.trim(),
      icon: newTopicIcon || '📚',
      descriptionVi: newTopicDesc.trim() || 'Chủ đề từ vựng tiếng Anh bổ ích dành cho học sinh tiểu học.',
      words: [],
      sentencePattern: {
        questionEn: 'What is this?',
        questionVi: 'Đây là cái gì thế?',
        answerPatternEn: 'It is a [từ vựng].',
        answerExampleEn: 'It is a great word!',
        answerExampleVi: 'Đó là một điều tuyệt vời!',
        guideVi: `Dùng để hỏi và vận dụng từ vựng trong chủ đề ${newTopicVi.trim()}.`,
      },
    };

    const updated = [...topics, newTopic];
    onUpdateTopics(updated);
    setSelectedTopicId(newTopic.id);
    setIsAddModalOpen(false);
    setNewTopicVi('');
    setNewTopicEn('');
  };

  // Add word to current topic
  const handleAddWordToTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnglish.trim() || !newVietnamese.trim()) return;

    const newWord: VocabWord = {
      id: `w-${Date.now()}`,
      english: newEnglish.trim(),
      vietnamese: newVietnamese.trim(),
      phonetic: newPhonetic.trim() || '',
      icon: newIcon || '✨',
      exampleEn: newExEn.trim() || '',
      exampleVi: newExVi.trim() || '',
    };

    const updatedTopics = topics.map((t) => {
      if (t.id === currentTopic.id) {
        return {
          ...t,
          words: [...t.words, newWord],
        };
      }
      return t;
    });

    onUpdateTopics(updatedTopics);
    setIsAddWordModalOpen(false);
    setNewEnglish('');
    setNewVietnamese('');
    setNewPhonetic('');
    setNewExEn('');
    setNewExVi('');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-black uppercase tracking-wider mb-2">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Thư Viện Từ Vựng Cơ Bản</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              12 Chủ Đề Tiếng Anh Tiểu Học & Tùy Biến
            </h2>
            <p className="text-sm text-emerald-100 max-w-xl font-medium mt-1">
              Các chủ đề quen thuộc, gần gũi với đời sống các em học sinh vùng cao. Thầy cô có thể tạo thêm chủ đề mới hoặc chỉnh sửa theo chương trình học.
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="self-start sm:self-center px-5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-900 font-extrabold text-xs sm:text-sm rounded-2xl shadow-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Chủ Đề Mới</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Topic selector on left, Words list on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Topics list (4 cols) */}
        <div className="lg:col-span-4 space-y-2">
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs max-h-[640px] overflow-y-auto scrollbar-thin space-y-1.5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2">
              Danh Sách Chủ Đề ({topics.length})
            </div>
            {topics.map((topic) => {
              const isSelected = topic.id === selectedTopicId;
              return (
                <button
                  key={topic.id}
                  onClick={() => setSelectedTopicId(topic.id)}
                  className={`w-full p-3.5 rounded-2xl text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500 text-white shadow-sm font-extrabold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{topic.icon}</span>
                    <div>
                      <div className="text-sm font-extrabold line-clamp-1">{topic.titleVi}</div>
                      <div className={`text-xs ${isSelected ? 'text-sky-100' : 'text-slate-400'}`}>
                        {topic.titleEn}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {topic.words.length} từ
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Words in Selected Topic (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{currentTopic.icon}</span>
                <div>
                  <h3 className="text-xl font-black text-slate-800">
                    {currentTopic.titleVi} ({currentTopic.titleEn})
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">{currentTopic.descriptionVi}</p>
                </div>
              </div>

              <button
                onClick={() => setIsAddWordModalOpen(true)}
                className="self-start sm:self-center px-4 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Từ Vựng</span>
              </button>
            </div>

            {/* Sentence Pattern Highlight for this topic */}
            {currentTopic.sentencePattern && (
              <div className="bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50/80 border-2 border-amber-300/80 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-400 text-amber-950 font-black text-xs uppercase tracking-wider flex items-center gap-1">
                      <span>✨</span>
                      <span>Mẫu Câu Trọng Tâm Vận Dụng</span>
                    </span>
                    <span className="text-xs font-bold text-amber-900 hidden md:inline">
                      (Vận dụng các từ vựng bên dưới vào mẫu câu)
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium italic">
                    {currentTopic.sentencePattern.guideVi}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Question Box */}
                  <div className="bg-white p-3.5 rounded-xl border border-amber-200/90 shadow-2xs space-y-1.5">
                    <div className="text-[11px] font-black uppercase tracking-wider text-sky-700 flex items-center justify-between">
                      <span>Mẫu Câu Hỏi (Question):</span>
                      <button
                        onClick={() => handlePlayPattern(currentTopic.sentencePattern.questionEn)}
                        disabled={playingPatternText === currentTopic.sentencePattern.questionEn}
                        className="px-2 py-0.5 rounded-md bg-sky-100 hover:bg-sky-200 text-sky-800 text-[10px] font-black flex items-center gap-1 transition-all cursor-pointer"
                        title="Nghe Thầy đọc câu hỏi"
                      >
                        <Volume2 className="w-3 h-3 text-sky-600" />
                        <span>{playingPatternText === currentTopic.sentencePattern.questionEn ? 'Đang đọc...' : 'Nghe'}</span>
                      </button>
                    </div>
                    <div className="text-base sm:text-lg font-black text-slate-900">
                      {currentTopic.sentencePattern.questionEn}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      Nghĩa: {currentTopic.sentencePattern.questionVi}
                    </div>
                  </div>

                  {/* Answer Box */}
                  <div className="bg-white p-3.5 rounded-xl border border-amber-200/90 shadow-2xs space-y-1.5">
                    <div className="text-[11px] font-black uppercase tracking-wider text-emerald-700 flex items-center justify-between">
                      <span>Mẫu Câu Trả Lời (Answer):</span>
                      <button
                        onClick={() => handlePlayPattern(currentTopic.sentencePattern.answerExampleEn)}
                        disabled={playingPatternText === currentTopic.sentencePattern.answerExampleEn}
                        className="px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-black flex items-center gap-1 transition-all cursor-pointer"
                        title="Nghe Thầy đọc ví dụ câu trả lời"
                      >
                        <Volume2 className="w-3 h-3 text-emerald-600" />
                        <span>{playingPatternText === currentTopic.sentencePattern.answerExampleEn ? 'Đang đọc...' : 'Nghe ví dụ'}</span>
                      </button>
                    </div>
                    <div className="text-base sm:text-lg font-black text-emerald-800">
                      {currentTopic.sentencePattern.answerPatternEn || currentTopic.sentencePattern.answerExampleEn}
                    </div>
                    <div className="text-xs font-semibold text-slate-600">
                      Ví dụ mẫu: <span className="font-bold text-slate-900">{currentTopic.sentencePattern.answerExampleEn}</span> ({currentTopic.sentencePattern.answerExampleVi})
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Words Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentTopic.words.map((word) => {
                const isPlaying = playingWordId === word.id;
                return (
                  <div
                    key={word.id}
                    className="p-4 rounded-2xl border border-slate-200/80 hover:border-sky-300 bg-slate-50/50 hover:bg-sky-50/30 transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{word.icon}</span>
                        <div>
                          <div className="text-lg font-black text-slate-900">{word.english}</div>
                          <div className="text-xs font-bold text-sky-600">{word.phonetic}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => handlePlayWord(word)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                          isPlaying
                            ? 'bg-rose-500 text-white animate-pulse'
                            : 'bg-white hover:bg-slate-100 text-slate-700 shadow-2xs border border-slate-200'
                        }`}
                        title="Nghe phát âm chuẩn"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-sm font-extrabold text-amber-800 bg-white/80 p-2 rounded-xl border border-slate-100">
                      Nghĩa: {word.vietnamese}
                    </div>

                    {word.exampleEn && (
                      <div className="text-xs text-slate-600 bg-white/60 p-2 rounded-xl border border-slate-100">
                        <div className="font-semibold text-slate-700">"{word.exampleEn}"</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">"{word.exampleVi}"</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {currentTopic.words.length === 0 && (
              <div className="p-8 text-center bg-slate-50 rounded-2xl text-xs text-slate-400 font-medium">
                Chủ đề này chưa có từ vựng nào. Hãy bấm "Thêm Từ Vựng" để bắt đầu!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: ADD CUSTOM TOPIC */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-black text-slate-800 mb-4">Tạo Chủ Đề Mới</h3>
            <form onSubmit={handleCreateTopic} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Tên tiếng Việt (Ví dụ: Đồ chơi yêu thích)
                </label>
                <input
                  type="text"
                  required
                  value={newTopicVi}
                  onChange={(e) => setNewTopicVi(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Tên tiếng Anh (Ví dụ: Favorite Toys)
                </label>
                <input
                  type="text"
                  required
                  value={newTopicEn}
                  onChange={(e) => setNewTopicEn(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Biểu tượng cảm xúc (Emoji)
                </label>
                <input
                  type="text"
                  value={newTopicIcon}
                  onChange={(e) => setNewTopicIcon(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-hidden"
                  placeholder="🧸"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold rounded-xl shadow-xs"
                >
                  Lưu Chủ Đề
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD WORD TO TOPIC */}
      {isAddWordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setIsAddWordModalOpen(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-black text-slate-800 mb-4">
              Thêm Từ Mới Vào "{currentTopic.titleVi}"
            </h3>
            <form onSubmit={handleAddWordToTopic} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Từ tiếng Anh (English Word)
                </label>
                <input
                  type="text"
                  required
                  value={newEnglish}
                  onChange={(e) => setNewEnglish(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-hidden"
                  placeholder="Ball"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Nghĩa tiếng Việt (Vietnamese Meaning)
                </label>
                <input
                  type="text"
                  required
                  value={newVietnamese}
                  onChange={(e) => setNewVietnamese(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-hidden"
                  placeholder="Quả bóng"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Phiên âm
                  </label>
                  <input
                    type="text"
                    value={newPhonetic}
                    onChange={(e) => setNewPhonetic(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden"
                    placeholder="/bɔːl/"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Biểu tượng
                  </label>
                  <input
                    type="text"
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden"
                    placeholder="⚽"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Ví dụ tiếng Anh (ngắn gọn)
                </label>
                <input
                  type="text"
                  value={newExEn}
                  onChange={(e) => setNewExEn(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden"
                  placeholder="I have a ball."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddWordModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-extrabold rounded-xl shadow-xs"
                >
                  Thêm Từ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

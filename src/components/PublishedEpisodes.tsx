import React, { useState } from 'react';
import { 
  Radio, Play, Pause, Download, Share2, Trash2, 
  ExternalLink, Clock, Sparkles, Check, School 
} from 'lucide-react';
import { RadioEpisode } from '../types/radio';

interface PublishedEpisodesProps {
  episodes: RadioEpisode[];
  onSelectEpisode: (episode: RadioEpisode) => void;
  onDeleteEpisode: (id: string) => void;
  onOpenShareModal: (episode: RadioEpisode) => void;
}

export const PublishedEpisodes: React.FC<PublishedEpisodesProps> = ({
  episodes,
  onSelectEpisode,
  onDeleteEpisode,
  onOpenShareModal,
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const handlePlayToggle = (ep: RadioEpisode) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingId === ep.id) {
      setPlayingId(null);
      return;
    }

    if (!ep.fullAudioUrl) {
      // Just select and navigate
      onSelectEpisode(ep);
      return;
    }

    const audio = new Audio(ep.fullAudioUrl);
    audioRef.current = audio;
    setPlayingId(ep.id);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audio.play().catch((err) => {
      console.warn('Playback blocked or failed:', err);
      setPlayingId(null);
    });
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-600 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-black uppercase tracking-wider mb-2">
              <Radio className="w-3.5 h-3.5" />
              <span>Kho Lưu Trữ Bài Phát Sóng</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Các Số Phát Thanh Đã Xuất Bản
            </h2>
            <p className="text-sm text-indigo-100 max-w-xl font-medium mt-1">
              Tất cả các số phát thanh được lưu trữ ổn định trên hệ thống máy chủ. Các lớp học có thể truy cập bất kỳ lúc nào qua đường link bài học.
            </p>
          </div>
        </div>
      </div>

      {/* Episodes List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {episodes.map((ep) => {
          const isPlaying = playingId === ep.id;
          const words = ep.targetWords || [];

          return (
            <div
              key={ep.id}
              className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                  <span className="flex items-center gap-1 text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md font-black">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{ep.durationMinutes || 5} phút</span>
                  </span>
                  <span>{new Date(ep.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>

                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug line-clamp-2">
                  {ep.title}
                </h3>

                <div className="text-xs font-extrabold text-amber-800 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60">
                  <div className="text-[11px] uppercase tracking-wider text-amber-700/80 mb-1">
                    Chủ đề: {ep.topicTitleVi} ({ep.topicTitleEn})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {words.map((w) => (
                      <span key={w.id} className="bg-white px-2 py-0.5 rounded-md border border-amber-200 shadow-2xs">
                        {w.icon} {w.english}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onSelectEpisode(ep)}
                    className="px-3.5 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    title="Mở trong Góc Học Sinh"
                  >
                    <School className="w-3.5 h-3.5" />
                    <span>Mở Lớp Học</span>
                  </button>

                  <button
                    onClick={() => onOpenShareModal(ep)}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                    title="Lấy link chia sẻ bài học"
                  >
                    <Share2 className="w-4 h-4 text-amber-500" />
                  </button>

                  {ep.fullAudioUrl && (
                    <a
                      href={ep.fullAudioUrl}
                      download={`${ep.title.replace(/\s+/g, '_')}.wav`}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                      title="Tải về file âm thanh WAV"
                    >
                      <Download className="w-4 h-4 text-indigo-500" />
                    </a>
                  )}
                </div>

                {ep.id !== 'demo-greetings-01' && (
                  <button
                    onClick={() => {
                      if (confirm(`Bạn có chắc chắn muốn xóa bài phát thanh "${ep.title}" không?`)) {
                        onDeleteEpisode(ep.id);
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                    title="Xóa bài này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {episodes.length === 0 && (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
          <Radio className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h4 className="text-base font-black text-slate-700">Chưa có bài phát thanh nào</h4>
          <p className="text-xs text-slate-500 mt-1">
            Hãy sang tab "Đài Tự Động AI" để tạo số phát thanh đầu tiên của bạn!
          </p>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { X, Copy, Check, QrCode, ExternalLink, School, Sparkles } from 'lucide-react';
import { RadioEpisode } from '../types/radio';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEpisode: RadioEpisode | null;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, currentEpisode }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const episodeId = currentEpisode?.id || 'demo-greetings-01';
  const episodeTitle = currentEpisode?.title || 'Số 01: Lời chào thân thương cùng Happy English Radio';
  
  // Construct student URL
  const baseUrl = window.location.origin;
  const shareUrl = `${baseUrl}/?episode=${episodeId}&mode=student`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-sky-100 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <School className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800">Chia Sẻ Bài Học Cho Lớp Học</h3>
            <p className="text-xs text-slate-500 font-medium">Học sinh mở ngay không cần đăng nhập tài khoản</p>
          </div>
        </div>

        <div className="bg-sky-50/70 border border-sky-100 rounded-2xl p-4 mb-5">
          <div className="text-xs font-bold text-sky-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bài học đang chọn:</span>
          </div>
          <div className="text-sm font-extrabold text-slate-800 leading-snug">{episodeTitle}</div>
        </div>

        {/* Link Box */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
            Đường dẫn bài học trực tuyến (Classroom URL)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-700 focus:outline-hidden select-all"
            />
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                copied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Đã sao chép!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* QR Code placeholder and classroom guide */}
        <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200/60 mb-6 flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-white border border-amber-200 flex items-center justify-center text-slate-800 shrink-0 shadow-xs">
            <QrCode className="w-10 h-10 text-slate-700" />
          </div>
          <div className="text-xs text-amber-900 leading-relaxed">
            <strong className="font-bold block mb-1">Hướng dẫn dành cho Thầy Cô:</strong>
            - Chiếu link này lên máy chiếu hoặc bảng thông minh trong lớp.<br />
            - Học sinh có thể nghe đồng thanh, lặp lại từ vựng theo khoảng lặng nhịp điệu của đài radio.<br />
            - Cả lớp có thể tham gia trả lời câu hỏi đố vui tiếng Anh cùng nhau!
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-sm"
          >
            <span>Mở Trang Học Sinh</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
};

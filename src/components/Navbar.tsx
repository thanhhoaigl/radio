import React from 'react';
import { Radio, Mic, Sparkles, BookOpen, Share2, Music, School } from 'lucide-react';

export type ActiveTab = 'auto' | 'live' | 'student' | 'topics' | 'episodes';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenShareModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange, onOpenShareModal }) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-sky-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo & Title */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onTabChange('student')}>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-sky-200">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-800">
                  HAPPY ENGLISH <span className="text-sky-500">RADIO</span>
                </span>
                <span className="hidden sm:inline-block text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
                  Tiểu học
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">
                Đài phát thanh tiếng Anh vui nhộn dành cho học sinh vùng cao
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => onTabChange('student')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                activeTab === 'student'
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-300'
                  : 'text-slate-600 hover:text-sky-600 hover:bg-sky-50'
              }`}
            >
              <School className="w-4 h-4" />
              <span>Góc Học Sinh</span>
            </button>

            <button
              onClick={() => onTabChange('auto')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                activeTab === 'auto'
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-300'
                  : 'text-slate-600 hover:text-sky-600 hover:bg-sky-50'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Đài Tự Động AI</span>
            </button>

            <button
              onClick={() => onTabChange('live')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                activeTab === 'live'
                  ? 'bg-rose-500 text-white shadow-sm shadow-rose-300'
                  : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Phòng Thu MC Nhí</span>
            </button>

            <button
              onClick={() => onTabChange('topics')}
              className={`hidden md:flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                activeTab === 'topics'
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-300'
                  : 'text-slate-600 hover:text-sky-600 hover:bg-sky-50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Thư Viện Chủ Đề</span>
            </button>

            <button
              onClick={() => onTabChange('episodes')}
              className={`hidden md:flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                activeTab === 'episodes'
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-300'
                  : 'text-slate-600 hover:text-sky-600 hover:bg-sky-50'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>Bài Đã Lưu</span>
            </button>
          </nav>

          {/* Quick Share Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenShareModal}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-400 text-amber-950 text-xs sm:text-sm font-extrabold rounded-xl shadow-sm hover:from-amber-300 hover:to-orange-300 transition-all active:scale-95 cursor-pointer"
              title="Lấy liên kết chia sẻ cho lớp học"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Chia Sẻ Cho Lớp</span>
              <span className="sm:hidden">Chia sẻ</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

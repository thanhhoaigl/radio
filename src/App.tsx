/**
 * HAPPY ENGLISH RADIO STUDIO
 * Đài Phát Thanh Tiếng Anh Vui Vẻ Dành Cho Học Sinh Tiểu Học Vùng Cao
 */

import React, { useState, useEffect } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { AutoRadioStudio } from './components/AutoRadioStudio';
import { LiveStudio } from './components/LiveStudio';
import { StudentClassroom } from './components/StudentClassroom';
import { TopicLibrary } from './components/TopicLibrary';
import { PublishedEpisodes } from './components/PublishedEpisodes';
import { ShareModal } from './components/ShareModal';
import { RadioEpisode, Topic } from './types/radio';
import { PRELOADED_TOPICS } from './data/topics';
import { DEMO_EPISODE } from './data/demoEpisode';
import { Radio, Heart, Sparkles, School } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('student');
  const [currentEpisode, setCurrentEpisode] = useState<RadioEpisode>(DEMO_EPISODE);
  const [episodesList, setEpisodesList] = useState<RadioEpisode[]>([DEMO_EPISODE]);
  const [topics, setTopics] = useState<Topic[]>(PRELOADED_TOPICS);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareModalEpisode, setShareModalEpisode] = useState<RadioEpisode | null>(null);

  // Parse URL query params on load (e.g., /?episode=demo-greetings-01&mode=student)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetEpisodeId = params.get('episode');
    const mode = params.get('mode');

    if (mode === 'live') {
      setActiveTab('live');
    } else if (mode === 'auto') {
      setActiveTab('auto');
    } else if (mode === 'student' || targetEpisodeId) {
      setActiveTab('student');
    }

    // Fetch episodes from persistent backend
    fetchEpisodes(targetEpisodeId);
  }, []);

  const fetchEpisodes = async (targetId?: string | null) => {
    try {
      const res = await fetch('/api/episodes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Merge demo episode if not present
          const hasDemo = data.some((e: any) => e.id === DEMO_EPISODE.id);
          const fullList = hasDemo ? data : [DEMO_EPISODE, ...data];
          setEpisodesList(fullList);

          if (targetId) {
            const found = fullList.find((e: any) => e.id === targetId);
            if (found) setCurrentEpisode(found);
          } else {
            setCurrentEpisode(fullList[0]);
          }
        }
      }
    } catch (err) {
      console.warn('Could not load episodes from backend, using default demo:', err);
    }
  };

  const handleEpisodePublished = (newEp: RadioEpisode) => {
    setCurrentEpisode(newEp);
    setEpisodesList((prev) => {
      const filtered = prev.filter((e) => e.id !== newEp.id);
      return [newEp, ...filtered];
    });
  };

  const handleDeleteEpisode = async (id: string) => {
    try {
      await fetch(`/api/episodes/${id}`, { method: 'DELETE' });
      setEpisodesList((prev) => prev.filter((e) => e.id !== id));
      if (currentEpisode.id === id) {
        setCurrentEpisode(DEMO_EPISODE);
      }
    } catch (err) {
      console.error('Không thể xóa bài phát thanh:', err);
    }
  };

  const handleOpenShare = (ep?: RadioEpisode) => {
    setShareModalEpisode(ep || currentEpisode);
    setIsShareModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/60 selection:bg-sky-200 selection:text-sky-900">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenShareModal={() => handleOpenShare()}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'student' && (
          <StudentClassroom
            currentEpisode={currentEpisode}
            onOpenShareModal={() => handleOpenShare()}
          />
        )}

        {activeTab === 'auto' && (
          <AutoRadioStudio
            onEpisodePublished={handleEpisodePublished}
            onOpenShareModal={() => handleOpenShare()}
          />
        )}

        {activeTab === 'live' && (
          <LiveStudio
            currentEpisode={currentEpisode}
          />
        )}

        {activeTab === 'topics' && (
          <TopicLibrary
            topics={topics}
            onUpdateTopics={setTopics}
          />
        )}

        {activeTab === 'episodes' && (
          <PublishedEpisodes
            episodes={episodesList}
            onSelectEpisode={(ep) => {
              setCurrentEpisode(ep);
              setActiveTab('student');
            }}
            onDeleteEpisode={handleDeleteEpisode}
            onOpenShareModal={(ep) => handleOpenShare(ep)}
          />
        )}
      </main>

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        currentEpisode={shareModalEpisode}
      />

      {/* Educational Footer */}
      <footer className="bg-white border-t border-sky-100 py-6 sm:py-8 mt-12 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-slate-800">
              HAPPY ENGLISH RADIO STUDIO
            </span>
            <span>—</span>
            <span className="font-medium text-slate-500">
              Chương trình hỗ trợ tiếng Anh cho học sinh tiểu học dân tộc thiểu số
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
            <span>Phương pháp: Nghe → Nhắc lại → Hiểu → Nhớ → Sử dụng</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

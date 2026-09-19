import React from 'react';
import { Leaf, Cpu, Volume2, VolumeX, Maximize2, Minimize2, BookOpen, LogOut, User, Award, Presentation, AlertOctagon, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';
import { playClickSound } from '../utils/audio';

interface NavbarProps {
  currentUser: UserProfile | null;
  isMuted: boolean;
  onToggleMute: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenGuide: () => void;
  onSwitchUser: () => void;
  recentPointChange?: number | null;
  activeTab?: 'sorting' | 'reports';
  onSelectTab?: (tab: 'sorting' | 'reports') => void;
  reportsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  isMuted,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
  onOpenGuide,
  onSwitchUser,
  recentPointChange,
  activeTab = 'sorting',
  onSelectTab,
  reportsCount,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md px-3 sm:px-4 lg:px-8 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand & Tab Navigation */}
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 border-2 border-emerald-400/50 shadow-lg shadow-emerald-500/20">
              <Leaf className="w-5 h-5 text-emerald-300 animate-pulse" />
              <Cpu className="w-3.5 h-3.5 text-cyan-300 absolute -bottom-0.5 -right-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-tight bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
                  EcoSort AI
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden lg:block font-medium">
                Phân loại rác & phản ánh môi trường
              </p>
            </div>
          </div>

          {/* Mobile Tab Switcher */}
          {onSelectTab && (
            <div className="flex md:hidden items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  onSelectTab('sorting');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'sorting'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Quét Rác
              </button>
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  onSelectTab('reports');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeTab === 'reports'
                    ? 'bg-teal-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Phản Ánh</span>
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              </button>
            </div>
          )}
        </div>

        {/* Desktop Central Navigation Tabs */}
        {onSelectTab && (
          <div className="hidden md:flex items-center bg-slate-900/90 border border-slate-800 p-1 rounded-2xl shadow-inner">
            <button
              id="tab-nav-sorting"
              type="button"
              onClick={() => {
                playClickSound();
                onSelectTab('sorting');
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
                activeTab === 'sorting'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Leaf className="w-3.5 h-3.5" />
              <span>Phân Loại Rác AI</span>
            </button>

            <button
              id="tab-nav-reports"
              type="button"
              onClick={() => {
                playClickSound();
                onSelectTab('reports');
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
                activeTab === 'reports'
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              <span>Phản Ánh Ô Nhiễm</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-mono shadow-sm">
                Mới
              </span>
            </button>
          </div>
        )}

        {/* User Status & Controls */}
        <div className="flex items-center gap-2 sm:gap-3 self-end md:self-center">
          {currentUser ? (
            <div className="flex items-center gap-2.5 bg-slate-900/90 hover:bg-slate-850 border-2 border-emerald-500/40 rounded-full pl-2 pr-3 py-1 shadow-lg shadow-emerald-950/50 transition-all hover:border-emerald-400">
              <span className="text-lg select-none" role="img" aria-label="avatar">
                {currentUser.avatar}
              </span>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-slate-100 leading-tight">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-emerald-400 font-semibold">
                  {currentUser.organization || 'Thành viên'}
                </div>
              </div>

              {/* Total Score Badge with animation */}
              <div className="relative flex items-center gap-1 bg-emerald-950 border border-emerald-400 text-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-black font-mono shadow-sm">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>{currentUser.totalPoints} đ</span>
                {recentPointChange && (
                  <span
                    key={recentPointChange + '-' + Date.now()}
                    className="absolute -bottom-5 right-0 text-xs font-extrabold text-amber-400 animate-bounce bg-slate-900 px-1.5 py-0.5 rounded-full border border-amber-400 shadow-lg shadow-amber-500/30"
                  >
                    +{recentPointChange}
                  </span>
                )}
              </div>

              <button
                id="btn-switch-user"
                onClick={() => {
                  playClickSound();
                  onSwitchUser();
                }}
                title="Đổi tài khoản"
                className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-rose-400 transition-all active:scale-90 ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              id="btn-login-prompt"
              onClick={() => {
                playClickSound();
                onSwitchUser();
              }}
              className="flex items-center gap-1.5 text-xs font-extrabold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-3 py-1.5 sm:py-2 rounded-full transition-all shadow-md shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-95 border border-emerald-300/40 whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5" />
              <span>Đăng nhập</span>
            </button>
          )}

          {/* Quick Guide modal button */}
          <button
            id="btn-open-guide"
            onClick={() => {
              playClickSound();
              onOpenGuide();
            }}
            title="Cẩm nang phân loại rác"
            className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-xs font-extrabold bg-slate-900/90 hover:bg-emerald-950/60 text-emerald-300 hover:text-emerald-200 border-2 border-emerald-500/40 hover:border-emerald-400 shadow-md shadow-emerald-950/40 hover:shadow-emerald-500/20 active:scale-95 transition-all whitespace-nowrap"
          >
            <BookOpen className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="hidden lg:inline">Cẩm Nang</span>
          </button>

          {/* Fullscreen for Presentation */}
          <button
            id="btn-toggle-fullscreen"
            onClick={() => {
              playClickSound();
              onToggleFullscreen();
            }}
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Chế độ Trình chiếu'}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-xs font-black border-2 transition-all shadow-md active:scale-95 whitespace-nowrap ${
              isFullscreen
                ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-cyan-500/25 ring-2 ring-cyan-400/40'
                : 'bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:via-blue-500 hover:to-indigo-500 text-white border-cyan-400/40 shadow-cyan-950/40 hover:shadow-cyan-500/30'
            }`}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4 text-cyan-300" />
                <span className="hidden sm:inline">Thu Nhỏ</span>
              </>
            ) : (
              <>
                <Presentation className="w-4 h-4 text-cyan-200" />
                <span className="hidden sm:inline">Trình Chiếu</span>
              </>
            )}
          </button>

          {/* Audio toggle button */}
          <button
            id="btn-toggle-audio"
            onClick={() => {
              playClickSound();
              onToggleMute();
            }}
            title={isMuted ? 'Bật âm thanh hiệu ứng' : 'Tắt âm thanh hiệu ứng'}
            className={`p-2 sm:p-2.5 rounded-xl border-2 transition-all active:scale-90 shadow-sm ${
              isMuted
                ? 'bg-rose-950/60 border-rose-500/50 text-rose-400 hover:bg-rose-900/60'
                : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/60 shadow-emerald-500/20'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};


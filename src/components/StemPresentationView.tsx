import React from 'react';
import { Minimize2, Award, Zap, Sparkles, Sprout, Recycle, ShieldAlert, Trophy } from 'lucide-react';
import { UserProfile, LeaderboardEntry, WasteHistoryRecord, WasteClassificationResult } from '../types';
import { WebcamScanner } from './WebcamScanner';
import { Leaderboard } from './Leaderboard';

interface StemPresentationViewProps {
  currentUser: UserProfile | null;
  leaderboardEntries: LeaderboardEntry[];
  history: WasteHistoryRecord[];
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  onClassified: (result: WasteClassificationResult) => void;
  onResetLeaderboard: () => void;
  onAddNewUser: () => void;
  onExitFullscreen: () => void;
  onDuplicateDetected?: (alert: any) => void;
  onOpenGuide?: () => void;
  onOpenSqlGuide?: () => void;
}

export const StemPresentationView: React.FC<StemPresentationViewProps> = ({
  currentUser,
  leaderboardEntries,
  history,
  isProcessing,
  setIsProcessing,
  onClassified,
  onResetLeaderboard,
  onAddNewUser,
  onExitFullscreen,
  onDuplicateDetected,
  onOpenGuide,
  onOpenSqlGuide,
}) => {
  const totalScans = history.length;
  const organicCount = history.filter((x) => x.category === 'organic').length;
  const recyclableCount = history.filter((x) => x.category === 'recyclable').length;
  const inorganicCount = history.filter((x) => x.category === 'inorganic').length;
  const co2Saved = (recyclableCount * 0.18 + organicCount * 0.12).toFixed(2);

  return (
    <div
      id="stem-presentation-overlay"
      className="fixed inset-0 z-50 bg-slate-950 text-slate-100 overflow-y-auto p-4 sm:p-6 flex flex-col justify-between"
    >
      {/* Top Presentation Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xl shadow-lg">
            🌱
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                EcoSort AI STEM &bull; TRÌNH CHIẾU CUỘC THI
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                LIVE STAGE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Đề tài: Hệ Thống Nhận Diện Rác Thông Minh Tích Điểm Thưởng & Xếp Hạng Môi Trường
            </p>
          </div>
        </div>

        {/* Current Active Contestant Big Card */}
        {currentUser && (
          <div className="hidden md:flex items-center gap-4 bg-slate-900/90 border border-emerald-500/40 px-5 py-2.5 rounded-2xl shadow-xl">
            <span className="text-3xl select-none">{currentUser.avatar}</span>
            <div>
              <div className="text-xs text-slate-400">Thí sinh đang trình diễn:</div>
              <div className="text-base font-black text-emerald-300">{currentUser.name}</div>
              <div className="text-xs text-slate-400">{currentUser.organization}</div>
            </div>
            <div className="pl-4 border-l border-slate-800 text-right">
              <div className="text-2xl font-black font-mono text-amber-400">{currentUser.totalPoints}</div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Tổng điểm</div>
            </div>
          </div>
        )}

        <button
          onClick={onExitFullscreen}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          <Minimize2 className="w-4 h-4" />
          <span>Thoát Trình Chiếu</span>
        </button>
      </div>

      {/* Main Presentation Grid: Camera on Left, Leaderboard on Right */}
      <div className="my-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Webcam Scanner (7 cols) */}
        <div className="lg:col-span-7">
          <WebcamScanner
            onClassified={onClassified}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
            onDuplicateDetected={onDuplicateDetected}
            onOpenGuide={onOpenGuide}
          />
        </div>

        {/* Right Column: Leaderboard (5 cols) */}
        <div className="lg:col-span-5 h-full">
          <Leaderboard
            entries={leaderboardEntries}
            currentUser={currentUser}
            onRefreshOnline={onResetLeaderboard}
            onAddNewUser={onAddNewUser}
            onOpenSqlGuide={onOpenSqlGuide}
          />
        </div>
      </div>

      {/* Bottom Live STEM Metrics Strip */}
      <div className="pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
        <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-400">Tổng Số Lần Quét</div>
          <div className="text-lg font-black font-mono text-slate-100">{totalScans}</div>
        </div>

        <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-emerald-400">Rác Hữu Cơ (+1đ)</div>
          <div className="text-lg font-black font-mono text-emerald-300">{organicCount}</div>
        </div>

        <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-amber-400">Rác Tái Chế (+2đ)</div>
          <div className="text-lg font-black font-mono text-amber-300">{recyclableCount}</div>
        </div>

        <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="text-[10px] uppercase font-bold text-orange-400">Rác Vô Cơ (+3đ)</div>
          <div className="text-lg font-black font-mono text-orange-300">{inorganicCount}</div>
        </div>

        <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
          <div className="text-[10px] uppercase font-bold text-cyan-400">CO2 Giảm Thiểu</div>
          <div className="text-lg font-black font-mono text-cyan-300">~{co2Saved} kg</div>
        </div>
      </div>
    </div>
  );
};

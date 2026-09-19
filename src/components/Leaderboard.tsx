import React, { useState } from 'react';
import {
  Trophy,
  Medal,
  Crown,
  Flame,
  Search,
  RotateCcw,
  UserPlus,
  Database,
  CheckCircle2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { LeaderboardEntry, UserProfile } from '../types';
import { playClickSound } from '../utils/audio';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUser: UserProfile | null;
  onRefreshOnline?: () => void;
  onAddNewUser: () => void;
  onOpenSqlGuide?: () => void;
  onResetAllPoints?: () => void;
  isLoading?: boolean;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  entries,
  currentUser,
  onRefreshOnline,
  onAddNewUser,
  onOpenSqlGuide,
  onResetAllPoints,
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Calculate true competition ranks:
  // - Contestants with points > 0: top 1, 2, 3 receive Gold/Silver/Bronze badges
  // - Contestants with identical points & correctCount share the SAME rank number (Đồng hạng)
  // - Contestants with 0 points: ranked neatly with neutral badge (no Crown/Medal to avoid false podiums)
  const rankedEntries = React.useMemo(() => {
    // Always strictly sort entries by totalPoints DESC, correctCount DESC, then lastActive DESC
    const sorted = [...entries].sort((a, b) => {
      const ptsA = a.totalPoints || 0;
      const ptsB = b.totalPoints || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      const cntA = a.correctCount || 0;
      const cntB = b.correctCount || 0;
      if (cntB !== cntA) return cntB - cntA;
      return (b.lastActive || 0) - (a.lastActive || 0);
    });

    let currentRank = 1;
    const result: (LeaderboardEntry & { displayRank: number; isTied: boolean; hasScore: boolean })[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const hasScore = (entry.totalPoints || 0) > 0;

      if (i > 0) {
        const prev = sorted[i - 1];
        const isSameScore =
          (entry.totalPoints || 0) === (prev.totalPoints || 0) &&
          (entry.correctCount || 0) === (prev.correctCount || 0);

        if (isSameScore) {
          result.push({
            ...entry,
            displayRank: currentRank,
            isTied: true,
            hasScore,
          });
          if (result[i - 1]) {
            result[i - 1].isTied = true;
          }
          continue;
        } else {
          currentRank = i + 1;
        }
      } else {
        currentRank = 1;
      }

      result.push({
        ...entry,
        displayRank: currentRank,
        isTied: false,
        hasScore,
      });
    }

    return result;
  }, [entries]);

  const filteredRankedEntries = rankedEntries.filter(
    (e) =>
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.organization && e.organization.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.email && e.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Find current user in rankedEntries
  const currentUserRankEntry = rankedEntries.find(
    (e) => e.isCurrentUser || (currentUser && e.id === currentUser.id)
  );

  const renderRankBadge = (entry: (typeof rankedEntries)[0]) => {
    if (!entry.hasScore) {
      return (
        <div
          title={`Thí sinh mới khởi tạo (0 điểm)${entry.isTied ? ' - Đồng hạng' : ''}`}
          className="flex items-center justify-center w-7 h-7 rounded-xl bg-slate-800/90 border border-slate-700/60 text-slate-400 font-mono font-bold text-xs"
        >
          #{entry.displayRank}
        </div>
      );
    }

    switch (entry.displayRank) {
      case 1:
        return (
          <div
            title={`Hạng 1 - Quán quân (${entry.totalPoints} điểm)${entry.isTied ? ' - Đồng hạng 1' : ''}`}
            className="flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 text-slate-950 font-black shadow-md shadow-amber-500/30 ring-1 ring-amber-300/40"
          >
            <Crown className="w-4 h-4" />
          </div>
        );
      case 2:
        return (
          <div
            title={`Hạng 2 - Á quân (${entry.totalPoints} điểm)${entry.isTied ? ' - Đồng hạng 2' : ''}`}
            className="flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 font-black shadow-md shadow-slate-300/30 ring-1 ring-slate-100/40"
          >
            <Medal className="w-4 h-4" />
          </div>
        );
      case 3:
        return (
          <div
            title={`Hạng 3 - Quý quân (${entry.totalPoints} điểm)${entry.isTied ? ' - Đồng hạng 3' : ''}`}
            className="flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 text-white font-black shadow-md shadow-amber-700/30 ring-1 ring-amber-400/40"
          >
            <Medal className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div
            title={`Hạng ${entry.displayRank}${entry.isTied ? ' - Đồng hạng' : ''}`}
            className="flex items-center justify-center w-7 h-7 rounded-xl bg-slate-800 text-slate-300 border border-slate-700/80 font-mono font-bold text-xs"
          >
            #{entry.displayRank}
          </div>
        );
    }
  };

  return (
    <div
      id="leaderboard-container"
      className="w-full flex flex-col h-full bg-slate-900/90 border-2 border-slate-800 rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 border-2 border-amber-400/50 text-amber-300 shadow-md shadow-amber-500/20">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm text-slate-100 tracking-tight flex items-center gap-1.5">
                  <span>BẢNG XẾP HẠNG</span>
                  <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Điểm cao xếp trên &bull; Thời gian thực
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                playClickSound();
                onAddNewUser();
              }}
              title="Đăng ký hoặc đổi người dùng"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border-2 border-emerald-500/60 hover:border-emerald-400 text-emerald-300 hover:text-white font-black text-xs shadow-md shadow-emerald-950/50 hover:shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>{currentUser ? 'Hồ Sơ' : 'Đăng Ký'}</span>
            </button>

            {onOpenSqlGuide && (
              <button
                onClick={() => {
                  playClickSound();
                  onOpenSqlGuide();
                }}
                title="Xem mã SQL & Trạng thái Supabase"
                className="p-2 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-slate-850 border border-slate-700/80 hover:border-cyan-500/50 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-cyan-400" />
              </button>
            )}

            {onRefreshOnline && (
              <button
                onClick={() => {
                  playClickSound();
                  onRefreshOnline();
                }}
                disabled={isLoading}
                title="Làm mới bảng xếp hạng trực tuyến"
                className="p-2 rounded-xl text-slate-400 hover:text-emerald-300 hover:bg-slate-850 border border-slate-700/80 hover:border-emerald-500/50 hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Point Rules Sub-bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-[10px] text-slate-300 mb-2">
          <span className="font-bold text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Quy tắc cộng điểm:</span>
          </span>
          <div className="flex items-center gap-2.5 font-bold">
            <span className="text-emerald-400">Hữu cơ: +1đ</span>
            <span className="text-amber-400">Tái chế: +2đ</span>
            <span className="text-orange-400">Vô cơ: +3đ</span>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên thí sinh, email hoặc lớp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>
      </div>

      {/* Current User Standing Banner */}
      {currentUser && (
        <div className="px-4 py-2.5 bg-emerald-950/60 border-b border-emerald-500/40 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl select-none flex-shrink-0">{currentUser.avatar}</span>
            <div className="min-w-0">
              <div className="font-bold text-emerald-200 flex items-center gap-1.5 flex-wrap">
                <span className="truncate max-w-[140px] sm:max-w-[180px]">Bạn: {currentUser.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 font-mono font-bold flex-shrink-0">
                  {currentUser.totalPoints > 0
                    ? `HẠNG #${currentUserRankEntry?.displayRank ?? 1}${currentUserRankEntry?.isTied ? ' (ĐỒNG HẠNG)' : ''}`
                    : currentUserRankEntry?.displayRank
                    ? `HẠNG #${currentUserRankEntry.displayRank} (0đ)`
                    : 'KHỞI TẠO (0đ)'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
                <span className="truncate max-w-[120px]">{currentUser.organization || 'Thành viên'}</span>
                <span>•</span>
                <span className="flex-shrink-0">Đúng: <strong className="text-emerald-300">{currentUser.correctCount || 0} lần</strong></span>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 font-mono font-black text-sm text-emerald-300 bg-emerald-900/80 px-3 py-1.5 rounded-xl border border-emerald-500/60 shadow-inner">
            {currentUser.totalPoints ?? 0} đ
          </div>
        </div>
      )}

      {/* Ranking List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[480px]">
        {filteredRankedEntries.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Trophy className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-xs font-bold text-slate-300 mb-1">
              Chưa có người chơi trên Bảng Xếp Hạng
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto mb-4">
              Hãy đăng ký tài khoản và quét rác để ghi tên vào bảng xếp hạng!
            </p>
            <button
              onClick={() => {
                playClickSound();
                onAddNewUser();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Đăng Ký Ngay</span>
            </button>
          </div>
        ) : (
          filteredRankedEntries.map((entry) => {
            const isMe =
              entry.isCurrentUser || (currentUser && entry.id === currentUser.id);

            return (
              <div
                key={entry.id}
                className={`p-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                  isMe
                    ? 'bg-emerald-950/50 border-emerald-500/60 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/40'
                    : entry.displayRank <= 3 && entry.hasScore
                    ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-950/40 border-slate-850 hover:border-slate-800'
                }`}
              >
                {/* Rank Badge */}
                <div className="flex-shrink-0">{renderRankBadge(entry)}</div>

                {/* Avatar */}
                <div className="text-xl select-none flex-shrink-0">{entry.avatar}</div>

                {/* Info */}
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs font-bold truncate max-w-[140px] sm:max-w-[190px] ${isMe ? 'text-emerald-200 font-extrabold' : 'text-slate-200'}`}>
                      {entry.name}
                    </span>
                    {isMe && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 flex-shrink-0 shadow-sm">
                        BẠN
                      </span>
                    )}
                    {entry.isTied && (
                      <span className="text-[9px] font-medium px-1 py-0.2 rounded bg-slate-800/90 text-slate-400 border border-slate-700/60 flex-shrink-0">
                        Đồng hạng
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate mt-0.5">
                    <span className="truncate max-w-[120px]">{entry.organization || 'Thành viên'}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1 flex-shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                      {entry.correctCount || 0} lần đúng
                    </span>
                  </div>
                </div>

                {/* Points: fixed min-width to never get squished or hidden */}
                <div className="flex-shrink-0 min-w-[70px] text-right bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-sm">
                  <div className="font-mono font-extrabold text-sm text-amber-400 leading-tight">
                    {entry.totalPoints ?? 0}
                  </div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 leading-none mt-0.5">điểm</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/50 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Tổng thí sinh: <strong className="text-slate-200">{entries.length}</strong></span>
        <span className="text-emerald-400 font-medium flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          Realtime Database
        </span>
      </div>
    </div>
  );
};

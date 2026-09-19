import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserProfile,
  LeaderboardEntry,
  WasteHistoryRecord,
  WasteClassificationResult,
  DuplicateAlertInfo,
} from './types';
import {
  loadUserProfile,
  saveUserProfile,
  clearUserProfile,
  loadHistory,
  saveHistory,
  clearHistory,
  loadLeaderboard,
  saveLeaderboard,
  getLevelTitle,
} from './utils/storage';
import { getIsMuted, toggleMute, playVictorySound, playPointSound } from './utils/audio';

import { Navbar } from './components/Navbar';
import { LoginModal } from './components/LoginModal';
import { WebcamScanner } from './components/WebcamScanner';
import { Leaderboard } from './components/Leaderboard';
import { ClassificationHistory } from './components/ClassificationHistory';
import { PointsNotification } from './components/PointsNotification';
import { DuplicateWarningToast } from './components/DuplicateWarningToast';
import { WasteGuideModal } from './components/WasteGuideModal';
import { StemPresentationView } from './components/StemPresentationView';
import { SupabaseSqlModal } from './components/SupabaseSqlModal';
import { WasteReportsView } from './components/WasteReportsView';
import {
  isSupabaseConfigured,
  getSupabase,
  fetchPlayerProfile,
  fetchOnlineLeaderboard,
  subscribeToLeaderboardChanges,
  recordClassificationOnline,
  initSupabaseAuthListener,
} from './lib/supabase';
import {
  recordPointsOnServer,
  fetchServerLeaderboard,
  registerPlayerOnServer,
  listenToLeaderboardStream,
} from './lib/serverSync';
import { Database, Code, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';

export default function App() {
  // User Profile
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    return loadUserProfile();
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Leaderboard & History
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>(() => {
    return loadLeaderboard(loadUserProfile());
  });
  const [history, setHistory] = useState<WasteHistoryRecord[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  // Processing & Notifications
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeNotification, setActiveNotification] = useState<WasteClassificationResult | null>(null);
  const [duplicateAlert, setDuplicateAlert] = useState<DuplicateAlertInfo | null>(null);
  const [recentPointChange, setRecentPointChange] = useState<number | null>(null);

  // Modals & UI States
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(getIsMuted);
  const [activeTab, setActiveTab] = useState<'sorting' | 'reports'>('sorting');

  const isSupabaseLive = isSupabaseConfigured();
  const currentUserRef = useRef<UserProfile | null>(currentUser);
  currentUserRef.current = currentUser;

  // Refresh online leaderboard directly from Supabase (and Central Realtime Server)
  const refreshLeaderboardOnline = useCallback(async (userOverride?: UserProfile | null) => {
    setIsLoadingLeaderboard(true);
    try {
      const activeUser = userOverride !== undefined ? userOverride : currentUserRef.current;

      // 1. Fetch from Supabase as primary online database
      let supabaseEntries: LeaderboardEntry[] = [];
      if (isSupabaseConfigured()) {
        const res = await fetchOnlineLeaderboard(activeUser?.id);
        if (res.entries && res.entries.length > 0) {
          supabaseEntries = res.entries;
        }
      }

      // 2. Fetch from Central Multi-Device Server
      const serverEntries = await fetchServerLeaderboard();

      let list: LeaderboardEntry[] = [];

      if (supabaseEntries.length > 0) {
        // SUPABASE IS AUTHORITATIVE: Database points are the direct source of truth
        const playerMap = new Map<string, LeaderboardEntry>();
        for (const entry of supabaseEntries) {
          playerMap.set(entry.id, { ...entry });
        }

        // Include any server-only players not yet in Supabase
        for (const entry of serverEntries) {
          if (!playerMap.has(entry.id)) {
            playerMap.set(entry.id, entry);
          }
        }
        list = Array.from(playerMap.values());
      } else {
        list = serverEntries;
      }

      // If activeUser is logged in, ensure activeUser is present in the list
      if (activeUser) {
        const idx = list.findIndex((e) => e.id === activeUser.id);

        if (idx >= 0) {
          list[idx].isCurrentUser = true;
          // Synchronize activeUser with authoritative database points
          if (list[idx].totalPoints !== activeUser.totalPoints) {
            const updated: UserProfile = {
              ...activeUser,
              totalPoints: list[idx].totalPoints,
              correctCount: list[idx].correctCount ?? activeUser.correctCount,
            };
            currentUserRef.current = updated;
            setCurrentUser(updated);
            saveUserProfile(updated);
          }
        } else {
          list.push({
            id: activeUser.id,
            name: activeUser.name,
            email: activeUser.email,
            organization: activeUser.organization || 'Khối Sáng Tạo STEM',
            totalPoints: activeUser.totalPoints || 0,
            correctCount: activeUser.correctCount || 0,
            avatar: activeUser.avatar || '🌱',
            levelTitle: getLevelTitle(activeUser.totalPoints || 0),
            lastActive: Date.now(),
            isCurrentUser: true,
          });
        }
      }

      // Explicitly mark isCurrentUser correctly for all entries by unique ID
      list = list.map((e) => ({
        ...e,
        isCurrentUser: Boolean(activeUser && e.id === activeUser.id),
      }));

      // ALWAYS sort by totalPoints DESC, correctCount DESC, then lastActive DESC
      list.sort((a, b) => {
        const ptsA = a.totalPoints || 0;
        const ptsB = b.totalPoints || 0;
        if (ptsB !== ptsA) return ptsB - ptsA;
        const cntA = a.correctCount || 0;
        const cntB = b.correctCount || 0;
        if (cntB !== cntA) return cntB - cntA;
        return (b.lastActive || 0) - (a.lastActive || 0);
      });

      if (list.length > 0) {
        setLeaderboardEntries(list);
        saveLeaderboard(list);
        return;
      }

      // If online returned empty, fallback to local storage
      const local = loadLeaderboard(activeUser);
      setLeaderboardEntries(local);
    } catch (e) {
      console.warn('Leaderboard fetch notice:', e);
      const local = loadLeaderboard(currentUserRef.current);
      setLeaderboardEntries(local);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, []);

  // Periodic polling for real-time updates across multiple devices
  useEffect(() => {
    // Initial sync
    refreshLeaderboardOnline();

    // Auto-poll every 3 seconds so all devices see live changes even if SSE disconnected
    const pollInterval = setInterval(() => {
      refreshLeaderboardOnline();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [refreshLeaderboardOnline]);

  // Initialize data, Real-time multi-device SSE stream, and Supabase Auth session on mount
  useEffect(() => {
    const loadedHistory = loadHistory();
    setHistory(loadedHistory);

    const cur = currentUserRef.current;
    if (cur) {
      registerPlayerOnServer(cur);
    }

    // 1. Subscribe to Central Server-Sent Events (SSE) stream for instant updates across 3 devices
    const unsubscribeSSE = listenToLeaderboardStream((serverBoard) => {
      if (Array.isArray(serverBoard) && serverBoard.length > 0) {
        const activeUser = currentUserRef.current;
        let list = serverBoard.map((e) => ({
          ...e,
          isCurrentUser: Boolean(activeUser && e.id === activeUser.id),
        }));

        if (activeUser) {
          const exists = list.some((e) => e.id === activeUser.id);
          if (!exists) {
            list.push({
              id: activeUser.id,
              name: activeUser.name,
              email: activeUser.email,
              organization: activeUser.organization || 'Khối Sáng Tạo STEM',
              totalPoints: activeUser.totalPoints || 0,
              correctCount: activeUser.correctCount || 0,
              avatar: activeUser.avatar || '🌱',
              levelTitle: getLevelTitle(activeUser.totalPoints || 0),
              lastActive: Date.now(),
              isCurrentUser: true,
            });
          }
        }

        list.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          if ((b.correctCount || 0) !== (a.correctCount || 0)) return (b.correctCount || 0) - (a.correctCount || 0);
          return (b.lastActive || 0) - (a.lastActive || 0);
        });

        setLeaderboardEntries(list);
        saveLeaderboard(list);

        if (activeUser) {
          const myEntry = list.find((e) => e.isCurrentUser);
          if (myEntry && myEntry.totalPoints > activeUser.totalPoints) {
            setCurrentUser((prev) => {
              if (!prev) return prev;
              const up = {
                ...prev,
                totalPoints: myEntry.totalPoints,
                correctCount: myEntry.correctCount,
              };
              saveUserProfile(up);
              return up;
            });
          }
        }
      }
    });

    const client = getSupabase();
    let supabaseSub: any = null;
    let supabaseChannel: any = null;

    if (client) {
      // 2. Auth state listener (auto-detects Google OAuth login and email logins)
      supabaseSub = initSupabaseAuthListener((profile) => {
        currentUserRef.current = profile;
        setCurrentUser(profile);
        saveUserProfile(profile);
        registerPlayerOnServer(profile);
        refreshLeaderboardOnline(profile);
      });

      // 3. Subscribe to Realtime Postgres changes on 'public.players'
      supabaseChannel = subscribeToLeaderboardChanges(() => {
        refreshLeaderboardOnline();
      });
    } else {
      const savedUser = loadUserProfile();
      if (!savedUser) {
        setIsLoginModalOpen(true);
      }
    }

    // Initial fetch
    refreshLeaderboardOnline();

    return () => {
      try {
        unsubscribeSSE();
      } catch (e) {
        console.warn('SSE cleanup notice:', e);
      }
      try {
        if (typeof supabaseSub === 'function') {
          supabaseSub();
        } else if (supabaseSub && typeof supabaseSub.unsubscribe === 'function') {
          supabaseSub.unsubscribe();
        }
      } catch (e) {
        console.warn('Supabase auth listener cleanup notice:', e);
      }
      try {
        if (supabaseChannel && client) {
          client.removeChannel(supabaseChannel);
        }
      } catch (e) {
        console.warn('Supabase channel cleanup notice:', e);
      }
    };
  }, [refreshLeaderboardOnline]);

  // Handle classification result from WebcamScanner
  const handleClassified = useCallback(
    async (result: WasteClassificationResult) => {
      // 0. Strict validation: Never award points if classification failed or object is not waste
      if (
        !result ||
        (result as any).isWaste === false ||
        (result as any).isNotWaste ||
        (result as any).isScreenOrPhotoSpoof ||
        !['organic', 'recyclable', 'inorganic'].includes(result.category)
      ) {
        return;
      }

      // 1. Verification: Award points for both live camera scanning and file uploads (unless reference only)
      const isValidScan = (result.source === 'webcam' || result.source === 'file_upload' || !result.source) && !result.isReferenceOnly;

      // Calculate points strictly according to STEM specification:
      // Hữu cơ -> +1, Tái chế -> +2, Vô cơ -> +3
      let pointsToAward = 0;
      if (isValidScan) {
        if (result.category === 'organic') pointsToAward = 1;
        else if (result.category === 'recyclable') pointsToAward = 2;
        else if (result.category === 'inorganic') pointsToAward = 3;
        else pointsToAward = result.points || 0;
      }

      // Display floating notification
      const displayResult: WasteClassificationResult = {
        ...result,
        points: pointsToAward,
      };
      setActiveNotification(displayResult);

      if (pointsToAward > 0) {
        setRecentPointChange(pointsToAward);
        playPointSound(pointsToAward);
        setTimeout(() => setRecentPointChange(null), 3000);
      }

      if (!isValidScan || pointsToAward <= 0) {
        return;
      }

      // 2. IMMEDIATE OPTIMISTIC LOCAL STATE UPDATE (Ensures points NEVER fail to register)
      let activeUser = currentUser;
      if (!activeUser) {
        activeUser = {
          id: 'user-' + Date.now(),
          name: 'Thí sinh STEM',
          organization: 'Khối Sáng Tạo STEM',
          avatar: '🌱',
          totalPoints: 0,
          correctCount: 0,
          organicCount: 0,
          recyclableCount: 0,
          inorganicCount: 0,
          createdAt: Date.now(),
        };
      }

      const wasPoints = activeUser.totalPoints;
      const newPoints = wasPoints + pointsToAward;
      const newCount = (activeUser.correctCount || 0) + 1;

      const updatedUser: UserProfile = {
        ...activeUser,
        totalPoints: newPoints,
        correctCount: newCount,
        organicCount: (activeUser.organicCount || 0) + (result.category === 'organic' ? 1 : 0),
        recyclableCount: (activeUser.recyclableCount || 0) + (result.category === 'recyclable' ? 1 : 0),
        inorganicCount: (activeUser.inorganicCount || 0) + (result.category === 'inorganic' ? 1 : 0),
      };

      // Update current user in memory and localStorage
      setCurrentUser(updatedUser);
      saveUserProfile(updatedUser);

      if (newPoints >= 20 && wasPoints < 20) {
        playVictorySound();
      }

      // Record to local classification history
      const newRecord: WasteHistoryRecord = {
        ...result,
        points: pointsToAward,
        id: 'record-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        timestamp: Date.now(),
        userName: updatedUser.name,
      };
      setHistory((prev) => {
        const next = [newRecord, ...prev];
        saveHistory(next);
        return next;
      });

      // Update Leaderboard immediately on screen so ranking changes in real-time
      setLeaderboardEntries((prev) => {
        let list = [...prev];
        const existingIdx = list.findIndex(
          (e) => e.id === updatedUser.id || e.name.trim().toLowerCase() === updatedUser.name.trim().toLowerCase()
        );
        const newEntry: LeaderboardEntry = {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          organization: updatedUser.organization || 'Khối Sáng Tạo STEM',
          totalPoints: updatedUser.totalPoints,
          correctCount: updatedUser.correctCount || 0,
          avatar: updatedUser.avatar || '🌱',
          levelTitle: getLevelTitle(updatedUser.totalPoints),
          lastActive: Date.now(),
          isCurrentUser: true,
        };

        if (existingIdx >= 0) {
          list[existingIdx] = newEntry;
        } else {
          list.push(newEntry);
        }

        list.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          if ((b.correctCount || 0) !== (a.correctCount || 0)) return (b.correctCount || 0) - (a.correctCount || 0);
          return b.lastActive - a.lastActive;
        });

        saveLeaderboard(list);
        return list;
      });

      // 3. CENTRAL AUTHORITATIVE RECORDING (Single pipeline: server updates, persists to Supabase, broadcasts SSE)
      try {
        const serverRes = await recordPointsOnServer({
          userId: updatedUser.id,
          userName: updatedUser.name,
          email: updatedUser.email,
          organization: updatedUser.organization,
          avatar: updatedUser.avatar,
          itemName: result.itemName,
          category: result.category,
          points: pointsToAward,
          confidence: result.confidence,
          source: result.source || 'webcam',
        });

        if (serverRes.success && serverRes.leaderboard) {
          const list = serverRes.leaderboard.map((e) => ({
            ...e,
            isCurrentUser: e.id === updatedUser.id,
          }));
          setLeaderboardEntries(list);
          saveLeaderboard(list);

          const myEntry = list.find((e) => e.id === updatedUser.id);
          if (myEntry) {
            const confirmedUser: UserProfile = {
              ...updatedUser,
              totalPoints: myEntry.totalPoints,
              correctCount: myEntry.correctCount ?? updatedUser.correctCount,
            };
            currentUserRef.current = confirmedUser;
            setCurrentUser(confirmedUser);
            saveUserProfile(confirmedUser);
          }
        }
      } catch (e) {
        console.warn('Central server sync error, attempting direct client Supabase fallback:', e);
        // Fallback only if the central server is completely unreachable
        if (isSupabaseLive || isSupabaseConfigured()) {
          try {
            const onlineRes = await recordClassificationOnline({
              itemName: result.itemName,
              category: result.category,
              points: pointsToAward,
              source: result.source || 'webcam',
              confidence: result.confidence,
              userId: updatedUser.id,
              userName: updatedUser.name,
              organization: updatedUser.organization,
              avatar: updatedUser.avatar,
            });

            if (onlineRes.success && onlineRes.totalPoints !== undefined) {
              const confirmedUser: UserProfile = {
                ...updatedUser,
                totalPoints: onlineRes.totalPoints,
                correctCount: onlineRes.correctCount ?? updatedUser.correctCount,
              };
              currentUserRef.current = confirmedUser;
              setCurrentUser(confirmedUser);
              saveUserProfile(confirmedUser);
            }
            await refreshLeaderboardOnline();
          } catch (err) {
            console.warn('Supabase fallback notice:', err);
          }
        }
      }
    },
    [currentUser, isSupabaseLive, refreshLeaderboardOnline]
  );

  // Handle user login / switch
  const handleLogin = async (profile: UserProfile) => {
    currentUserRef.current = profile;
    setCurrentUser(profile);
    saveUserProfile(profile);
    setIsLoginModalOpen(false);
    setLeaderboardEntries(loadLeaderboard(profile));
    await registerPlayerOnServer(profile);
    await refreshLeaderboardOnline(profile);
  };

  // Handle sign out
  const handleLogout = () => {
    currentUserRef.current = null;
    clearUserProfile();
    setCurrentUser(null);
    refreshLeaderboardOnline(null);
  };

  // Clear history
  const handleClearHistory = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử phân loại rác cục bộ?')) {
      clearHistory();
      setHistory([]);
    }
  };

  // Audio toggle
  const handleToggleMute = () => {
    const muted = toggleMute();
    setIsMuted(muted);
  };

  // Handle anti-cheat duplicate detected
  const handleDuplicateDetected = (alert: DuplicateAlertInfo) => {
    setDuplicateAlert(alert);
    setActiveNotification(null);
  };

  // Fullscreen presentation toggle
  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Navbar */}
      <Navbar
        currentUser={currentUser}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenGuide={() => setIsGuideOpen(true)}
        onSwitchUser={() => setIsLoginModalOpen(true)}
        recentPointChange={recentPointChange}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Floating Points Notification */}
      <PointsNotification
        result={activeNotification}
        onDismiss={() => setActiveNotification(null)}
      />

      {/* Anti-Cheat Duplicate Warning Toast */}
      <DuplicateWarningToast
        alert={duplicateAlert}
        onDismiss={() => setDuplicateAlert(null)}
        onConfirmDroppedInBin={() => setDuplicateAlert(null)}
        onOpenGuide={() => {
          setDuplicateAlert(null);
          setIsGuideOpen(true);
        }}
      />

      {/* Supabase Authentication / User Profile Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        currentUser={currentUser}
        onClose={currentUser ? () => setIsLoginModalOpen(false) : undefined}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onOpenSqlGuide={() => setIsSqlModalOpen(true)}
      />

      {/* STEM Waste Guide Modal */}
      <WasteGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Supabase SQL & Security Schema Guide Modal */}
      <SupabaseSqlModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
      />

      {/* Fullscreen Presentation View if activated */}
      {isFullscreen && (
        <StemPresentationView
          currentUser={currentUser}
          leaderboardEntries={leaderboardEntries}
          history={history}
          isProcessing={isProcessing}
          setIsProcessing={setIsProcessing}
          onClassified={handleClassified}
          onResetLeaderboard={refreshLeaderboardOnline}
          onAddNewUser={() => setIsLoginModalOpen(true)}
          onExitFullscreen={() => setIsFullscreen(false)}
          onDuplicateDetected={handleDuplicateDetected}
          onOpenGuide={() => setIsGuideOpen(true)}
          onOpenSqlGuide={() => setIsSqlModalOpen(true)}
        />
      )}

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {activeTab === 'reports' ? (
          <WasteReportsView
            currentUser={currentUser}
            onOpenLogin={() => setIsLoginModalOpen(true)}
          />
        ) : (
          <>
            {/* Project STEM Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-cyan-950/40 border border-slate-800 p-5 sm:p-6 shadow-2xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    DỰ ÁN CÔNG NGHỆ MÔI TRƯỜNG &bull; CUỘC THI STEM 2026
                  </div>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-100 tracking-tight">
                    Hệ Thống Phân Loại Rác Thông Minh & Tích Điểm Thưởng
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-1 leading-relaxed">
                    Ứng dụng AI nhận diện rác trực tiếp qua Webcam, lưu trữ và đồng bộ thời gian thực qua <strong className="text-emerald-300">Cơ sở dữ liệu Supabase</strong>. Quy tắc điểm STEM: <span className="text-emerald-400 font-bold">Hữu cơ +1đ</span>, <span className="text-amber-400 font-bold">Tái chế +2đ</span>, <span className="text-orange-400 font-bold">Vô cơ +3đ</span>. Bảng xếp hạng tự động cập nhật từ cao xuống thấp.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('reports')}
                    className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-teal-950/80 hover:bg-teal-900/90 border border-teal-500/40 text-teal-300 text-xs font-bold transition-all shadow-sm active:scale-95"
                  >
                    <span>📢 Kênh Phản Ánh Tình Trạng Rác Thải (Mới) &rarr;</span>
                  </button>
                </div>

                {/* Current Active Contestant Quick Stats Pill */}
                {currentUser && (
                  <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-700/80 rounded-2xl p-3 shadow-lg">
                    <span className="text-3xl select-none">{currentUser.avatar}</span>
                    <div className="text-left">
                      <div className="text-xs text-slate-400">Điểm của bạn:</div>
                      <div className="text-2xl font-black font-mono text-amber-400 leading-none">
                        {currentUser.totalPoints} <span className="text-xs text-slate-300 font-normal">điểm</span>
                      </div>
                      <div className="text-[10px] text-emerald-400 mt-1 font-semibold">
                        {currentUser.name} ({currentUser.correctCount || 0} lần đúng)
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Row: Webcam Scanner on Left, Leaderboard on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: Webcam AI Scanner (7 Columns) */}
              <div className="lg:col-span-7">
                <WebcamScanner
                  onClassified={handleClassified}
                  isProcessing={isProcessing}
                  setIsProcessing={setIsProcessing}
                  onDuplicateDetected={handleDuplicateDetected}
                  onOpenGuide={() => setIsGuideOpen(true)}
                />
              </div>

              {/* Right: Leaderboard (5 Columns) */}
              <div className="lg:col-span-5 h-full">
                <Leaderboard
                  entries={leaderboardEntries}
                  currentUser={currentUser}
                  onRefreshOnline={refreshLeaderboardOnline}
                  onAddNewUser={() => setIsLoginModalOpen(true)}
                  onOpenSqlGuide={() => setIsSqlModalOpen(true)}
                  isLoading={isLoadingLeaderboard}
                />
              </div>
            </div>

            {/* Secondary Row: Classification History & Impact Metrics */}
            <ClassificationHistory
              history={history}
              onClearHistory={handleClearHistory}
            />
          </>
        )}
      </main>


      {/* STEM Footer */}
      <footer id="stem-footer" className="w-full border-t border-slate-800 bg-slate-950 py-5 px-4 text-center">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <span>🌱</span>
            <span>Chúng em xin chân thành cảm ơn <strong className="text-emerald-400 font-semibold">Ban Giám Khảo</strong> đã dành thời gian theo dõi và đánh giá dự án!</span>
          </div>
          <div className="text-slate-500 text-[11px] whitespace-nowrap">
            EcoSort AI &bull; Dự án STEM Bảo Vệ Môi Trường
          </div>
        </div>
      </footer>
    </div>
  );
}

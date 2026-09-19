import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

export interface StoredPlayer {
  id: string;
  name: string;
  email: string;
  organization: string;
  avatar: string;
  totalPoints: number;
  correctCount: number;
  organicCount: number;
  recyclableCount: number;
  inorganicCount: number;
  lastActive: number;
  createdAt: number;
}

export interface StoredHistoryItem {
  id: string;
  userId: string;
  userName: string;
  itemName: string;
  category: 'organic' | 'recyclable' | 'inorganic';
  points: number;
  confidence: number;
  source: string;
  timestamp: number;
}

export interface StoredWasteReport {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorOrg?: string;
  location: string;
  description: string;
  imageUrl: string;
  wasteTypeDetected: string;
  severityLevel: 'low' | 'medium' | 'high' | 'urgent';
  moderationStatus: 'approved' | 'rejected';
  moderationDetails: {
    approved: boolean;
    imageCheckPassed: boolean;
    textCheckPassed: boolean;
    isAIGenerated?: boolean;
    aiAuthenticityPassed?: boolean;
    rejectionReason?: string;
    wasteTypeDetected?: string;
    severityLevel?: 'low' | 'medium' | 'high' | 'urgent';
    summary?: string;
    checkedAt: number;
    moderatedBy: string;
  };
  status: 'reported' | 'investigating' | 'resolved';
  createdAt: number;
  upvotes: number;
  upvotedUserIds?: string[];
  resolutionNote?: string;
}

interface StoreData {
  players: StoredPlayer[];
  history: StoredHistoryItem[];
  reports: StoredWasteReport[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'stem_data.json');

const SUPABASE_URL = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://cuxalsutwmzowwhdrjrq.supabase.co'
).trim();
const SUPABASE_ANON_KEY = (
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1eGFsc3V0d216b3d3aGRyanJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Mzk4MDQsImV4cCI6MjEwNTExNTgwNH0.NwNnkBZs_aYCV0MWpP2ZGotM5UuM2C9RH4rMVQPLf-M'
).trim();

function getSupabaseServerClient() {
  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes('qzoxbcsxnjzdsodfxhfl') ||
    SUPABASE_URL.includes('placeholder')
  ) {
    return null;
  }
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.warn('[EcoSort Store] Error initializing Supabase client:', err);
    return null;
  }
}

let cachedData: StoreData = {
  players: [],
  history: [],
  reports: [],
};

const INITIAL_VERIFIED_REPORTS: StoredWasteReport[] = [];

const listeners = new Set<(event: { type: string; leaderboard?: StoredPlayer[]; item?: StoredHistoryItem; report?: StoredWasteReport }) => void>();

function ensureDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function saveDataToDisk() {
  try {
    ensureDirExists();
    fs.writeFileSync(DATA_FILE, JSON.stringify(cachedData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save stem_data.json:', err);
  }
}

function loadDataFromDisk(): boolean {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.players)) {
        cachedData = {
          players: parsed.players,
          history: Array.isArray(parsed.history) ? parsed.history : [],
          reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        };
        return true;
      }
    }
  } catch (err) {
    console.warn('Notice loading stem_data.json:', err);
  }
  cachedData.reports = [];
  return false;
}

export function getLevelTitle(points: number): string {
  if (points >= 100) return 'Đại Sứ Hành Tinh Xanh';
  if (points >= 60) return 'Chuyên Gia Tái Chế STEM';
  if (points >= 30) return 'Hiệp Sĩ Môi Trường';
  if (points >= 15) return 'Chiến Binh Phân Loại';
  if (points >= 5) return 'Tập Sự Phân Loại';
  return 'Thành Viên Mới';
}

export function getLeaderboard(): (StoredPlayer & { levelTitle: string })[] {
  const sorted = [...cachedData.players].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return b.lastActive - a.lastActive;
  });

  return sorted.map((p) => ({
    ...p,
    levelTitle: getLevelTitle(p.totalPoints),
  }));
}

export function subscribeToStoreUpdates(listener: (event: any) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(type: string, item?: StoredHistoryItem) {
  const leaderboard = getLeaderboard();
  for (const listener of listeners) {
    try {
      listener({ type, leaderboard, item });
    } catch (e) {
      console.warn('Listener notification notice:', e);
    }
  }
}

export function upsertPlayer(profile: {
  id?: string;
  name: string;
  email?: string;
  organization?: string;
  avatar?: string;
  totalPoints?: number;
}): StoredPlayer {
  const cleanName = profile.name.trim();
  const cleanEmail = (profile.email || '').trim().toLowerCase();

  // STRICT ID-BASED MATCHING: Never merge users solely based on identical names
  let existing = cachedData.players.find(
    (p) =>
      (profile.id && p.id === profile.id) ||
      (cleanEmail && p.email.trim().toLowerCase() === cleanEmail)
  );

  if (existing) {
    if (profile.id && !existing.id) existing.id = profile.id;
    if (profile.organization) existing.organization = profile.organization;
    if (profile.avatar) existing.avatar = profile.avatar;
    if (profile.email && !existing.email) existing.email = profile.email;
    if (profile.totalPoints !== undefined && profile.totalPoints > existing.totalPoints) {
      existing.totalPoints = profile.totalPoints;
    }
    existing.lastActive = Date.now();
    saveDataToDisk();
    notifyListeners('player_updated');
    return existing;
  }

  const newPlayer: StoredPlayer = {
    id: profile.id || 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    name: cleanName || 'Thí sinh STEM',
    email: profile.email || `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}@ecosort.stem`,
    organization: profile.organization || 'Lớp 11A1 - CLB STEM',
    avatar: profile.avatar || '🌱',
    totalPoints: profile.totalPoints || 0,
    correctCount: 0,
    organicCount: 0,
    recyclableCount: 0,
    inorganicCount: 0,
    lastActive: Date.now(),
    createdAt: Date.now(),
  };

  cachedData.players.push(newPlayer);
  saveDataToDisk();
  notifyListeners('player_registered');
  return newPlayer;
}

export async function resetAllPlayerPoints(): Promise<{
  count: number;
  leaderboard: (StoredPlayer & { levelTitle: string })[];
}> {
  // Reset all players' scores and counters to 0
  for (const player of cachedData.players) {
    player.totalPoints = 0;
    player.correctCount = 0;
    player.organicCount = 0;
    player.recyclableCount = 0;
    player.inorganicCount = 0;
    player.lastActive = Date.now();
  }

  // Clear classification history
  cachedData.history = [];

  // Save to local JSON disk
  saveDataToDisk();

  // Sync reset to Supabase players table if accessible
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await supabase
      .from('players')
      .update({
        total_points: 0,
        correct_count: 0,
        organic_count: 0,
        recyclable_count: 0,
        inorganic_count: 0,
        updated_at: new Date().toISOString(),
      })
      .not('id', 'is', null);
  } catch (err) {
    console.warn('Notice resetting Supabase players points:', err);
  }

  // Broadcast reset event to all connected devices via SSE
  const leaderboard = getLeaderboard();
  for (const listener of listeners) {
    try {
      listener({ type: 'leaderboard_reset', leaderboard });
    } catch (e) {
      console.warn('Listener notice on leaderboard reset:', e);
    }
  }

  return {
    count: cachedData.players.length,
    leaderboard,
  };
}

export function recordClassification(params: {
  userId?: string;
  userName: string;
  email?: string;
  organization?: string;
  avatar?: string;
  itemName: string;
  category: 'organic' | 'recyclable' | 'inorganic';
  points: number;
  confidence?: number;
  source?: string;
}): { player: StoredPlayer; leaderboard: (StoredPlayer & { levelTitle: string })[] } {
  // Ensure valid points (Hữu cơ: 1, Tái chế: 2, Vô cơ: 3)
  let pts = params.points;
  if (params.category === 'organic') pts = 1;
  else if (params.category === 'recyclable') pts = 2;
  else if (params.category === 'inorganic') pts = 3;

  const player = upsertPlayer({
    id: params.userId,
    name: params.userName,
    email: params.email,
    organization: params.organization,
    avatar: params.avatar,
  });

  player.totalPoints += pts;
  player.correctCount += 1;
  if (params.category === 'organic') player.organicCount += 1;
  else if (params.category === 'recyclable') player.recyclableCount += 1;
  else if (params.category === 'inorganic') player.inorganicCount += 1;
  player.lastActive = Date.now();

  const historyItem: StoredHistoryItem = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    userId: player.id,
    userName: player.name,
    itemName: params.itemName,
    category: params.category,
    points: pts,
    confidence: params.confidence || 0.95,
    source: params.source || 'webcam',
    timestamp: Date.now(),
  };

  cachedData.history.unshift(historyItem);
  // Keep last 300 logs
  if (cachedData.history.length > 300) {
    cachedData.history = cachedData.history.slice(0, 300);
  }

  saveDataToDisk();
  notifyListeners('points_awarded', historyItem);

  // Background sync to Supabase players table
  syncToSupabase(player, historyItem).catch((e) => {
    console.warn('Background Supabase sync notice:', e);
  });

  return {
    player,
    leaderboard: getLeaderboard(),
  };
}

export function getHistory(limit = 50): StoredHistoryItem[] {
  return cachedData.history.slice(0, limit);
}

// Waste Reports methods
export function getWasteReports(options: { onlyApproved?: boolean; status?: string } = {}): StoredWasteReport[] {
  const { onlyApproved = true, status } = options;
  let list = cachedData.reports || [];
  
  if (onlyApproved) {
    list = list.filter((r) => r.moderationStatus === 'approved');
  }

  if (status && status !== 'all') {
    list = list.filter((r) => r.status === status);
  }

  // Sort newest first
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export function addWasteReport(report: StoredWasteReport): StoredWasteReport {
  if (!cachedData.reports) {
    cachedData.reports = [];
  }
  if (!report.upvotedUserIds) {
    report.upvotedUserIds = report.authorId ? [report.authorId] : [];
  }
  cachedData.reports.unshift(report);
  saveDataToDisk();

  // Asynchronously persist to Supabase shared database
  const supabase = getSupabaseServerClient();
  if (supabase) {
    Promise.resolve(
      supabase.from('waste_reports').insert({
        id: report.id,
        author_id: report.authorId,
        author_name: report.authorName,
        author_avatar: report.authorAvatar,
        author_org: report.authorOrg,
        location: report.location,
        description: report.description,
        image_url: report.imageUrl,
        waste_type_detected: report.wasteTypeDetected,
        severity_level: report.severityLevel,
        moderation_status: report.moderationStatus,
        status: report.status,
        upvotes: report.upvotes,
        upvoted_user_ids: report.upvotedUserIds,
        resolution_note: report.resolutionNote,
        created_at: new Date(report.createdAt).toISOString(),
      })
    )
      .then(({ error }: any) => {
        if (error) console.warn('Supabase insert waste_report error:', error.message);
      })
      .catch((e: any) => console.warn('Supabase waste_reports insert notice:', e?.message));
  }
  
  // Notify connected clients via SSE
  for (const listener of listeners) {
    try {
      listener({ type: 'waste_report_added', report });
    } catch (e) {
      console.warn('Listener notice on waste report:', e);
    }
  }

  return report;
}

export function deleteWasteReport(
  id: string,
  requesterId?: string,
  isAdmin?: boolean
): { success: boolean; unauthorized?: boolean; notFound?: boolean } {
  if (!cachedData.reports) return { success: false, notFound: true };
  const report = cachedData.reports.find((r) => r.id === id);
  if (!report) return { success: false, notFound: true };

  // Authorization check: Only report author or admin can delete
  if (!isAdmin && requesterId && report.authorId !== requesterId) {
    return { success: false, unauthorized: true };
  }

  cachedData.reports = cachedData.reports.filter((r) => r.id !== id);
  saveDataToDisk();

  // Synchronize deletion to Supabase
  const supabase = getSupabaseServerClient();
  if (supabase) {
    Promise.resolve(supabase.from('waste_reports').delete().eq('id', id))
      .then(({ error }: any) => {
        if (error) console.warn('Supabase delete waste_report error:', error.message);
      })
      .catch((e: any) => console.warn('Supabase delete report notice:', e?.message));
  }

  for (const listener of listeners) {
    try {
      listener({ type: 'waste_report_deleted', report: { id } as any });
    } catch (e) {
      console.warn('Listener notice on waste report delete:', e);
    }
  }
  return { success: true };
}

export function clearAllWasteReports(isAdmin?: boolean): { success: boolean; unauthorized?: boolean } {
  if (!isAdmin) {
    return { success: false, unauthorized: true };
  }
  cachedData.reports = [];
  saveDataToDisk();

  // Synchronize clear to Supabase
  const supabase = getSupabaseServerClient();
  if (supabase) {
    Promise.resolve(supabase.from('waste_reports').delete().neq('id', '___'))
      .then(({ error }: any) => {
        if (error) console.warn('Supabase clear waste_reports error:', error.message);
      })
      .catch((e: any) => console.warn('Supabase clear reports notice:', e?.message));
  }

  for (const listener of listeners) {
    try {
      listener({ type: 'waste_reports_cleared' });
    } catch (e) {
      console.warn('Listener notice on waste reports clear:', e);
    }
  }
  return { success: true };
}

export function updateWasteReportStatus(
  id: string,
  status: 'reported' | 'investigating' | 'resolved',
  resolutionNote?: string,
  _requesterId?: string,
  _isAdmin?: boolean
): { success: boolean; report?: StoredWasteReport; notFound?: boolean } {
  const report = (cachedData.reports || []).find((r) => r.id === id);
  if (!report) return { success: false, notFound: true };

  report.status = status;
  if (resolutionNote !== undefined) {
    report.resolutionNote = resolutionNote;
  }
  saveDataToDisk();

  // Synchronize update to Supabase
  const supabase = getSupabaseServerClient();
  if (supabase) {
    Promise.resolve(
      supabase
        .from('waste_reports')
        .update({
          status,
          resolution_note: resolutionNote || null,
        })
        .eq('id', id)
    )
      .then(({ error }: any) => {
        if (error) console.warn('Supabase update waste_report error:', error.message);
      })
      .catch((e: any) => console.warn('Supabase status update notice:', e?.message));
  }

  for (const listener of listeners) {
    try {
      listener({ type: 'waste_report_updated', report });
    } catch (e) {
      console.warn('Listener notice on waste report update:', e);
    }
  }

  return { success: true, report };
}

export function upvoteWasteReport(
  id: string,
  userId: string
): { success: boolean; report?: StoredWasteReport; error?: string } {
  const report = (cachedData.reports || []).find((r) => r.id === id);
  if (!report) return { success: false, error: 'Không tìm thấy bài phản ánh.' };

  if (!userId) {
    return { success: false, error: 'Vui lòng đăng nhập để gửi lượt đồng tình.' };
  }

  if (!report.upvotedUserIds) {
    report.upvotedUserIds = [];
  }

  // Anti-duplicate upvote check: One user cannot upvote multiple times
  if (report.upvotedUserIds.includes(userId)) {
    return {
      success: false,
      error: 'Bạn đã gửi lượt đồng tình cho bài phản ánh này rồi.',
      report,
    };
  }

  report.upvotedUserIds.push(userId);
  report.upvotes = (report.upvotes || 0) + 1;
  saveDataToDisk();

  // Synchronize upvote to Supabase
  const supabase = getSupabaseServerClient();
  if (supabase) {
    Promise.resolve(
      supabase
        .from('waste_reports')
        .update({
          upvotes: report.upvotes,
          upvoted_user_ids: report.upvotedUserIds,
        })
        .eq('id', id)
    )
      .then(({ error }: any) => {
        if (error) console.warn('Supabase upvote update error:', error.message);
      })
      .catch((e: any) => console.warn('Supabase upvote notice:', e?.message));
  }

  for (const listener of listeners) {
    try {
      listener({ type: 'waste_report_upvoted', report });
    } catch (e) {
      console.warn('Listener notice on waste report upvote:', e);
    }
  }

  return { success: true, report };
}


// Background sync to Supabase if accessible
async function syncToSupabase(player: StoredPlayer, historyItem: StoredHistoryItem) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  try {
    // 1. Try RPC with user id (6 params)
    const { error: rpcErr6 } = await supabase.rpc('record_waste_classification', {
      p_item_name: historyItem.itemName,
      p_category: historyItem.category,
      p_points: historyItem.points,
      p_source: historyItem.source,
      p_confidence: historyItem.confidence,
      p_user_id: player.id,
    });

    if (rpcErr6) {
      // Try 5 params RPC
      await supabase.rpc('record_waste_classification', {
        p_item_name: historyItem.itemName,
        p_category: historyItem.category,
        p_points: historyItem.points,
        p_source: historyItem.source,
        p_confidence: historyItem.confidence,
      });
    }

    // 2. Direct table update on players
    await supabase.from('players').update({
      total_points: player.totalPoints,
      correct_count: player.correctCount,
      organic_count: player.organicCount,
      recyclable_count: player.recyclableCount,
      inorganic_count: player.inorganicCount,
      updated_at: new Date().toISOString(),
    }).eq('id', player.id);
  } catch (e) {
    // Non-fatal, local server store is secondary
  }
}

// Directly synchronize leaderboard from Supabase players table
export async function syncLeaderboardFromSupabase(): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  try {
    const { data: dbPlayers, error } = await supabase
      .from('players')
      .select('*')
      .order('total_points', { ascending: false })
      .order('correct_count', { ascending: false });

    if (!error && Array.isArray(dbPlayers) && dbPlayers.length > 0) {
      for (const row of dbPlayers) {
        // STRICT ID MATCHING: Never merge accounts solely by username
        const existing = cachedData.players.find((p) => p.id === row.id);

        if (!existing) {
          cachedData.players.push({
            id: row.id,
            name: row.username || 'Thí sinh STEM',
            email: row.email || `${row.username || 'player'}@ecosort.stem`,
            organization: row.organization || 'Lớp 11A1 - CLB STEM',
            avatar: row.avatar || '🌱',
            totalPoints: row.total_points ?? 0,
            correctCount: row.correct_count ?? 0,
            organicCount: row.organic_count ?? 0,
            recyclableCount: row.recyclable_count ?? 0,
            inorganicCount: row.inorganic_count ?? 0,
            lastActive: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
            createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          });
        } else {
          // Supabase is authoritative source of truth for scores
          existing.totalPoints = row.total_points ?? 0;
          existing.correctCount = row.correct_count ?? 0;
          existing.organicCount = row.organic_count ?? 0;
          existing.recyclableCount = row.recyclable_count ?? 0;
          existing.inorganicCount = row.inorganic_count ?? 0;
          if (row.username) existing.name = row.username;
          if (row.organization) existing.organization = row.organization;
          if (row.avatar) existing.avatar = row.avatar;
        }
      }
      saveDataToDisk();
    }
  } catch (err) {
    console.warn('[EcoSort Store] Notice syncing from Supabase:', err);
  }
}

// Synchronize waste reports from Supabase shared database
export async function syncWasteReportsFromSupabase(): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  try {
    const { data: dbReports, error } = await supabase
      .from('waste_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(dbReports) && dbReports.length > 0) {
      cachedData.reports = dbReports.map((row: any) => ({
        id: row.id,
        authorId: row.author_id || 'community-user',
        authorName: row.author_name || 'Người dân cộng đồng',
        authorAvatar: row.author_avatar || '🌱',
        authorOrg: row.author_org || 'Khối Sáng Tạo STEM',
        location: row.location || 'Địa điểm công cộng',
        description: row.description || '',
        imageUrl: row.image_url || '',
        wasteTypeDetected: row.waste_type_detected || 'Rác thải sinh hoạt',
        severityLevel: row.severity_level || 'medium',
        moderationStatus: row.moderation_status || 'approved',
        moderationDetails: {
          approved: row.moderation_status === 'approved',
          imageCheckPassed: true,
          textCheckPassed: true,
          checkedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          moderatedBy: 'EcoSort Vision Guard & Supabase Cloud Store',
        },
        status: row.status || 'reported',
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        upvotes: row.upvotes ?? 0,
        upvotedUserIds: Array.isArray(row.upvoted_user_ids) ? row.upvoted_user_ids : [],
        resolutionNote: row.resolution_note || undefined,
      }));
      saveDataToDisk();
    }
  } catch (err) {
    console.warn('[EcoSort Store] Notice syncing waste reports from Supabase:', err);
  }
}

// Preload existing Supabase players and reports into memory on startup
export async function initStore(): Promise<void> {
  loadDataFromDisk();
  await Promise.allSettled([
    syncLeaderboardFromSupabase(),
    syncWasteReportsFromSupabase(),
  ]);
  console.log(`[EcoSort Store] Initialized with ${cachedData.players.length} players and ${cachedData.reports?.length || 0} waste reports synchronized with Supabase.`);
}

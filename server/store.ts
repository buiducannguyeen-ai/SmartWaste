import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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

export interface StoredPreparationStep {
  id: string;
  instruction: string;
  reason?: string;
  isSafetyWarning?: boolean;
  status?: 'pending' | 'completed' | 'not_applicable';
}

export interface StoredHistoryItem {
  id: string;
  scanId?: string;
  userId: string;
  userName: string;
  itemName: string;
  category: 'organic' | 'recyclable' | 'inorganic';
  points: number;
  confidence: number;
  source: string;
  timestamp: number;
  preparationSteps?: StoredPreparationStep[];
  specialHandlingNotice?: string;
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

export interface StoredMisclassificationFeedback {
  id: string;
  timestamp: number;
  userId?: string;
  userName?: string;
  itemName: string;
  aiCategory: string;
  aiConfidence: number;
  userSuggestedCategory: 'organic' | 'recyclable' | 'inorganic';
  userNote?: string;
  thumbnail?: string;
}

export interface StoredFingerprintRecord {
  id: string;
  scanId?: string;
  userId?: string;
  userName?: string;
  itemName: string;
  category: 'organic' | 'recyclable' | 'inorganic';
  points: number;
  timestamp: number;
  checksum: string;
  dHash: string;
  aHash: string;
  centerDHash?: string;
  quadrantHashes?: string[];
  colorBins?: number[];
  thumbnail?: string;
  detectionTier?: 'exact_file' | 'modified_image' | 'same_physical_object' | 'screen_spoof' | 'suspicious';
  screenSpoofScore?: number;
}

/**
 * Server-authoritative Pending Scan Session.
 * Only legitimate scans created by server-side AI receive a scanId.
 * Points can only be awarded once, with strict validation against this session.
 */
export interface PendingScanSession {
  scanId: string;
  userId: string;
  userIp?: string;
  itemName: string;
  category: 'organic' | 'recyclable' | 'inorganic';
  points: number;
  confidence: number;
  isWaste: boolean;
  isUncertain: boolean;
  isHazardousOrSpecial: boolean;
  requiresRescanEmpty: boolean;
  status: 'pending' | 'completed' | 'expired' | 'rejected';
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
}

/**
 * Server-managed daily scan quota record.
 * Keyed by userId and dateKey (YYYY-MM-DD in Asia/Ho_Chi_Minh).
 * Resets strictly at 00:00 midnight Vietnam time.
 */
export interface UserQuotaRecord {
  userId: string;
  dateKey: string;
  usedScans: number;
  remainingScans: number;
  lastScanAt: number;
}

export const DAILY_SCAN_LIMIT = Number(process.env.DAILY_SCAN_LIMIT) || 30;

interface StoreData {
  players: StoredPlayer[];
  history: StoredHistoryItem[];
  reports: StoredWasteReport[];
  misclassifications?: StoredMisclassificationFeedback[];
  processedScanIds?: string[];
  fingerprints?: StoredFingerprintRecord[];
  pendingScans?: Record<string, PendingScanSession>;
  quotas?: Record<string, UserQuotaRecord>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'stem_data.json');

const SUPABASE_URL = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://ykmpehvrgmtyhcxnefih.supabase.co'
).trim();
const SUPABASE_ANON_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrbXBlaHZyZ210eWhjeG5lZmloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMDI5NDAsImV4cCI6MjEwNzc3ODk0MH0.cFiebtP5kGYoT32EOmGIGACIAQ8954o3_iAaglQ2npI'
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
  misclassifications: [],
  processedScanIds: [],
  fingerprints: [],
  pendingScans: {},
  quotas: {},
};

const processedScanIdsSet = new Set<string>();

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
          misclassifications: Array.isArray(parsed.misclassifications) ? parsed.misclassifications : [],
          processedScanIds: Array.isArray(parsed.processedScanIds) ? parsed.processedScanIds : [],
          fingerprints: Array.isArray(parsed.fingerprints) ? parsed.fingerprints : [],
          pendingScans: (parsed.pendingScans && typeof parsed.pendingScans === 'object') ? parsed.pendingScans : {},
          quotas: (parsed.quotas && typeof parsed.quotas === 'object') ? parsed.quotas : {},
        };
        processedScanIdsSet.clear();
        for (const id of cachedData.processedScanIds || []) {
          processedScanIdsSet.add(id);
        }
        for (const h of cachedData.history) {
          if (h.scanId) processedScanIdsSet.add(h.scanId);
        }
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

let cachedLeaderboardResult: (StoredPlayer & { levelTitle: string })[] | null = null;
let lastLeaderboardCacheTime = 0;
const LEADERBOARD_CACHE_TTL_MS = 2500;

export function invalidateLeaderboardCache() {
  cachedLeaderboardResult = null;
  lastLeaderboardCacheTime = 0;
}

export function getLeaderboard(): (StoredPlayer & { levelTitle: string })[] {
  const now = Date.now();
  if (cachedLeaderboardResult && now - lastLeaderboardCacheTime < LEADERBOARD_CACHE_TTL_MS) {
    return cachedLeaderboardResult;
  }

  const sorted = [...cachedData.players]
    .filter((p) => p.name !== '\\Admin_test/' && p.name !== 'Admin_test')
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return b.lastActive - a.lastActive;
    });

  cachedLeaderboardResult = sorted.map((p) => ({
    ...p,
    levelTitle: getLevelTitle(p.totalPoints),
  }));
  lastLeaderboardCacheTime = now;

  return cachedLeaderboardResult;
}

export function subscribeToStoreUpdates(listener: (event: any) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let sseBroadcastTimer: NodeJS.Timeout | null = null;

function notifyListeners(type: string, item?: StoredHistoryItem) {
  invalidateLeaderboardCache();

  // If item notification, broadcast immediately
  if (item) {
    const leaderboard = getLeaderboard();
    for (const listener of listeners) {
      try {
        listener({ type, leaderboard, item });
      } catch (e) {
        console.warn('Listener notification notice:', e);
      }
    }
    return;
  }

  // Coalesce rapid leaderboard updates over 100ms window
  if (sseBroadcastTimer) return;
  sseBroadcastTimer = setTimeout(() => {
    sseBroadcastTimer = null;
    const leaderboard = getLeaderboard();
    for (const listener of listeners) {
      try {
        listener({ type, leaderboard });
      } catch (e) {
        console.warn('Listener notification notice:', e);
      }
    }
  }, 100);
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

export function getPlayer(idOrEmail: string): StoredPlayer | undefined {
  if (!idOrEmail) return undefined;
  const clean = idOrEmail.trim().toLowerCase();
  return cachedData.players.find(
    (p) => (p.id && p.id === idOrEmail) || (p.email && p.email.trim().toLowerCase() === clean)
  );
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

  // Clear classification history, processed scan IDs and fingerprint registry
  cachedData.history = [];
  cachedData.processedScanIds = [];
  cachedData.fingerprints = [];
  processedScanIdsSet.clear();

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

/**
 * Compute SHA-256 checksum server-side directly from image data.
 * Does not trust client-declared checksums.
 */
export function computeServerImageChecksum(data: string): string {
  if (!data) return '0000000000000000';
  const raw = data.includes(',') ? data.split(',')[1] : data;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Find existing stored fingerprint by exact server-calculated checksum
 */
export function findStoredFingerprintByChecksum(checksum: string): StoredFingerprintRecord | undefined {
  if (!checksum || !cachedData.fingerprints) return undefined;
  return cachedData.fingerprints.find((fp) => fp.checksum === checksum);
}

/**
 * Returns YYYY-MM-DD date key in Asia/Ho_Chi_Minh timezone
 */
export function getVietnamDateKey(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Get current daily scan quota status for a user/guest
 */
export function getScanQuota(userId: string, now: Date = new Date()): {
  limit: number;
  used: number;
  remaining: number;
  dateKey: string;
} {
  if (!cachedData.quotas) cachedData.quotas = {};
  const dateKey = getVietnamDateKey(now);
  const record = cachedData.quotas[userId];
  if (!record || record.dateKey !== dateKey) {
    return {
      limit: DAILY_SCAN_LIMIT,
      used: 0,
      remaining: DAILY_SCAN_LIMIT,
      dateKey,
    };
  }
  return {
    limit: DAILY_SCAN_LIMIT,
    used: record.usedScans,
    remaining: Math.max(0, DAILY_SCAN_LIMIT - record.usedScans),
    dateKey,
  };
}

/**
 * Atomically check and consume 1 scan quota turn.
 * Resets automatically when date advances past 00:00 Asia/Ho_Chi_Minh.
 */
export function consumeScanQuota(userId: string, now: Date = new Date()): {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  dateKey: string;
  reason?: string;
} {
  if (!cachedData.quotas) cachedData.quotas = {};
  const dateKey = getVietnamDateKey(now);
  let record = cachedData.quotas[userId];

  // If no record or date is from a previous calendar day, reset quota for the new day
  if (!record || record.dateKey !== dateKey) {
    record = {
      userId,
      dateKey,
      usedScans: 0,
      remainingScans: DAILY_SCAN_LIMIT,
      lastScanAt: now.getTime(),
    };
    cachedData.quotas[userId] = record;
  }

  // Atomic check before calling AI
  if (record.usedScans >= DAILY_SCAN_LIMIT) {
    return {
      allowed: false,
      limit: DAILY_SCAN_LIMIT,
      used: record.usedScans,
      remaining: 0,
      dateKey,
      reason: `Bạn đã đạt giới hạn ${DAILY_SCAN_LIMIT} lượt quét AI trong ngày hôm nay. Hạn mức sẽ tự động được làm mới vào lúc 00:00 ngày mai (giờ Việt Nam).`,
    };
  }

  record.usedScans += 1;
  record.remainingScans = Math.max(0, DAILY_SCAN_LIMIT - record.usedScans);
  record.lastScanAt = now.getTime();
  saveDataToDisk();

  return {
    allowed: true,
    limit: DAILY_SCAN_LIMIT,
    used: record.usedScans,
    remaining: record.remainingScans,
    dateKey,
  };
}

/**
 * Creates a server-authoritative pending scan session.
 * Scan sessions expire after 15 minutes and can only be credited once.
 */
export function createPendingScanSession(params: {
  userId: string;
  userIp?: string;
  itemName: string;
  category: 'organic' | 'recyclable' | 'inorganic';
  points: number;
  confidence: number;
  isWaste: boolean;
  isUncertain: boolean;
  isHazardousOrSpecial?: boolean;
  requiresRescanEmpty?: boolean;
}): PendingScanSession {
  if (!cachedData.pendingScans) cachedData.pendingScans = {};
  const scanId = `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = Date.now();
  const session: PendingScanSession = {
    scanId,
    userId: params.userId,
    userIp: params.userIp,
    itemName: params.itemName,
    category: params.category,
    points: params.requiresRescanEmpty ? 0 : params.points,
    confidence: params.confidence,
    isWaste: params.isWaste,
    isUncertain: params.isUncertain,
    isHazardousOrSpecial: Boolean(params.isHazardousOrSpecial),
    requiresRescanEmpty: Boolean(params.requiresRescanEmpty),
    status: (params.isUncertain || !params.isWaste) ? 'rejected' : 'pending',
    createdAt: now,
    expiresAt: now + 15 * 60 * 1000, // Valid for 15 minutes
  };

  cachedData.pendingScans[scanId] = session;
  saveDataToDisk();
  return session;
}

export function getPendingScanSession(scanId: string): PendingScanSession | undefined {
  if (!cachedData.pendingScans) return undefined;
  return cachedData.pendingScans[scanId];
}

/**
 * Securely records classification points with rigorous server-side verification:
 * 1. scanId must exist in server's pending sessions.
 * 2. scanId must not have been already credited (idempotency).
 * 3. scanId must not be expired (>15 min).
 * 4. Scan must have been valid (not uncertain, not rejected).
 * 5. Points awarded are strictly server-computed session points (client cannot dictate points or category).
 * 6. Atomic transition to completed.
 */
export function recordClassification(params: {
  scanId?: string;
  userId?: string;
  userName: string;
  email?: string;
  organization?: string;
  avatar?: string;
  itemName?: string;
  category?: 'organic' | 'recyclable' | 'inorganic';
  points?: number;
  confidence?: number;
  source?: string;
  preparationSteps?: StoredPreparationStep[];
  specialHandlingNotice?: string;
}): {
  success: boolean;
  player?: StoredPlayer;
  leaderboard?: (StoredPlayer & { levelTitle: string })[];
  alreadyProcessed?: boolean;
  pointsAwarded?: number;
  error?: string;
} {
  const uid = params.userId || 'guest';

  // 1. MUST HAVE SCAN ID
  if (!params.scanId) {
    return {
      success: false,
      error: 'Yêu cầu không hợp lệ: Thiếu mã định danh lượt quét (scanId) được cấp từ máy chủ.',
    };
  }

  // 2. IDEMPOTENCY CHECK: If already credited, do NOT award duplicate points
  if (processedScanIdsSet.has(params.scanId)) {
    console.log(`[EcoSort Store] scanId ${params.scanId} already processed. Idempotent return without duplicate points.`);
    const player = getPlayer(uid) || upsertPlayer({
      id: uid,
      name: params.userName,
      email: params.email,
      organization: params.organization,
      avatar: params.avatar,
    });
    return {
      success: true,
      player,
      leaderboard: getLeaderboard(),
      alreadyProcessed: true,
      pointsAwarded: 0,
    };
  }

  // 3. LOOKUP PENDING SCAN SESSION IN SERVER STORE
  if (!cachedData.pendingScans) cachedData.pendingScans = {};
  const session = cachedData.pendingScans[params.scanId];

  if (!session) {
    return {
      success: false,
      error: 'Phát hiện yêu cầu không hợp lệ: scanId không tồn tại hoặc chưa từng được hệ thống AI phân tích hợp lệ.',
    };
  }

  // 4. VERIFY STATUS & INTEGRITY
  if (session.status === 'completed') {
    processedScanIdsSet.add(params.scanId);
    const player = getPlayer(uid) || upsertPlayer({
      id: uid,
      name: params.userName,
      email: params.email,
      organization: params.organization,
      avatar: params.avatar,
    });
    return {
      success: true,
      player,
      leaderboard: getLeaderboard(),
      alreadyProcessed: true,
      pointsAwarded: 0,
    };
  }

  if (session.status === 'rejected' || session.isUncertain || !session.isWaste) {
    return {
      success: false,
      error: 'Lượt quét này không đủ điều kiện tích điểm (AI chưa chắc chắn hoặc phát hiện ảnh gian lận/không phải rác).',
    };
  }

  if (Date.now() > session.expiresAt) {
    session.status = 'expired';
    saveDataToDisk();
    return {
      success: false,
      error: 'Lượt quét đã hết hạn (>15 phút). Vui lòng quét lại vật thể thật để nhận điểm.',
    };
  }

  if (session.requiresRescanEmpty && session.points === 0) {
    return {
      success: false,
      error: 'Chai hoặc ly còn nước thừa chưa đạt chuẩn tái chế. Hãy đổ cạn nước và quét camera nghiệm thu trước khi tích điểm.',
    };
  }

  // STRICT USER OWNERSHIP VERIFICATION:
  // Cannot steal someone else's scan session or use a guest account to claim a registered student's scan.
  if (session.userId && session.userId !== uid) {
    return {
      success: false,
      error: 'Lượt quét (scanId) này thuộc về tài khoản hoặc phiên làm việc khác, không thể nhận điểm thay.',
    };
  }

  // ATOMIC LOCK: Mark session as completed
  session.status = 'completed';
  session.completedAt = Date.now();
  processedScanIdsSet.add(params.scanId);
  if (!cachedData.processedScanIds) cachedData.processedScanIds = [];
  cachedData.processedScanIds.push(params.scanId);
  if (cachedData.processedScanIds.length > 2000) {
    cachedData.processedScanIds = cachedData.processedScanIds.slice(-2000);
  }

  // AUTHORITATIVE SERVER POINTS (Client cannot dictate points or category!)
  const pts = session.points;
  const category = session.category;
  const itemName = session.itemName;

  const player = upsertPlayer({
    id: uid,
    name: params.userName,
    email: params.email,
    organization: params.organization,
    avatar: params.avatar,
  });

  player.totalPoints += pts;
  player.correctCount += 1;
  if (category === 'organic') player.organicCount += 1;
  else if (category === 'recyclable') player.recyclableCount += 1;
  else if (category === 'inorganic') player.inorganicCount += 1;
  player.lastActive = Date.now();

  const historyItem: StoredHistoryItem = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    scanId: params.scanId,
    userId: player.id,
    userName: player.name,
    itemName,
    category,
    points: pts,
    confidence: session.confidence || 0.95,
    source: params.source || 'webcam',
    timestamp: Date.now(),
    preparationSteps: params.preparationSteps,
    specialHandlingNotice: params.specialHandlingNotice,
  };

  cachedData.history.unshift(historyItem);
  if (cachedData.history.length > 300) {
    cachedData.history = cachedData.history.slice(0, 300);
  }

  saveDataToDisk();
  notifyListeners('points_awarded', historyItem);

  syncToSupabase(player, historyItem).catch((e) => {
    console.warn('Background Supabase sync notice:', e);
  });

  return {
    success: true,
    player,
    leaderboard: getLeaderboard(),
    alreadyProcessed: false,
    pointsAwarded: pts,
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
    // 1. Try 7-parameter RPC with p_scan_id (Atomic row lock & idempotency check)
    const { error: rpcErr7 } = await supabase.rpc('record_waste_classification', {
      p_item_name: historyItem.itemName,
      p_category: historyItem.category,
      p_points: historyItem.points,
      p_source: historyItem.source,
      p_confidence: historyItem.confidence,
      p_user_id: player.id,
      p_scan_id: historyItem.scanId || null,
    });

    if (rpcErr7) {
      // 2. Fallback to 6 params RPC
      const { error: rpcErr6 } = await supabase.rpc('record_waste_classification', {
        p_item_name: historyItem.itemName,
        p_category: historyItem.category,
        p_points: historyItem.points,
        p_source: historyItem.source,
        p_confidence: historyItem.confidence,
        p_user_id: player.id,
      });

      if (rpcErr6) {
        // 3. Fallback to 5 params RPC
        await supabase.rpc('record_waste_classification', {
          p_item_name: historyItem.itemName,
          p_category: historyItem.category,
          p_points: historyItem.points,
          p_source: historyItem.source,
          p_confidence: historyItem.confidence,
        });
      }
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
    const fetchPromise = supabase
      .from('players')
      .select('*')
      .order('total_points', { ascending: false })
      .order('correct_count', { ascending: false });

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'Supabase sync timeout (2.5s)' } }), 2500)
    );

    const { data: dbPlayers, error } = await Promise.race([fetchPromise, timeoutPromise]);

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
    const fetchPromise = supabase
      .from('waste_reports')
      .select('*')
      .order('created_at', { ascending: false });

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'Supabase sync timeout (2.5s)' } }), 2500)
    );

    const { data: dbReports, error } = await Promise.race([fetchPromise, timeoutPromise]);

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

// Misclassification user feedback storage (for STEM review, not auto-labeling)
export function addMisclassificationFeedback(data: {
  userId?: string;
  userName?: string;
  itemName: string;
  aiCategory: string;
  aiConfidence: number;
  userSuggestedCategory: 'organic' | 'recyclable' | 'inorganic';
  userNote?: string;
  thumbnail?: string;
}): StoredMisclassificationFeedback {
  const newFeedback: StoredMisclassificationFeedback = {
    id: 'fb-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    timestamp: Date.now(),
    userId: data.userId,
    userName: data.userName || 'Thí sinh',
    itemName: data.itemName,
    aiCategory: data.aiCategory,
    aiConfidence: data.aiConfidence,
    userSuggestedCategory: data.userSuggestedCategory,
    userNote: data.userNote || '',
    thumbnail: data.thumbnail,
  };

  if (!cachedData.misclassifications) {
    cachedData.misclassifications = [];
  }
  cachedData.misclassifications.unshift(newFeedback);
  if (cachedData.misclassifications.length > 200) {
    cachedData.misclassifications = cachedData.misclassifications.slice(0, 200);
  }
  saveDataToDisk();
  return newFeedback;
}

export function getMisclassificationFeedbacks(): StoredMisclassificationFeedback[] {
  return cachedData.misclassifications || [];
}

// ==========================================
// ANTI-CHEAT CROSS-DEVICE FINGERPRINT STORE
// ==========================================

export function getStoredFingerprints(): StoredFingerprintRecord[] {
  return cachedData.fingerprints || [];
}

export function addStoredFingerprint(record: StoredFingerprintRecord): void {
  if (!cachedData.fingerprints) {
    cachedData.fingerprints = [];
  }
  // Remove existing with same id or identical scanId
  cachedData.fingerprints = cachedData.fingerprints.filter(
    (f) => f.id !== record.id && (!record.scanId || f.scanId !== record.scanId)
  );
  cachedData.fingerprints.push(record);
  // Keep last 300 scans for persistent anti-cheat cross-checking
  if (cachedData.fingerprints.length > 300) {
    cachedData.fingerprints = cachedData.fingerprints.slice(-300);
  }
  saveDataToDisk();
}

export function clearAllStoredFingerprints(): void {
  cachedData.fingerprints = [];
  saveDataToDisk();
}

export function calculateServerHashSimilarity(hashA?: string, hashB?: string): number {
  if (!hashA || !hashB || hashA.length === 0 || hashB.length === 0) return 0;
  const minLen = Math.min(hashA.length, hashB.length);
  let matches = 0;
  for (let i = 0; i < minLen; i++) {
    if (hashA[i] === hashB[i]) matches++;
  }
  return matches / minLen;
}

export function calculateServerHistogramSimilarity(histA?: number[], histB?: number[]): number {
  if (!histA || !histB || histA.length !== histB.length || histA.length === 0) return 0;
  let intersection = 0;
  for (let i = 0; i < histA.length; i++) {
    intersection += Math.min(histA[i], histB[i]);
  }
  return Math.min(1.0, Math.max(0.0, intersection));
}

export function evaluateFingerprintServerSide(
  currentFp: {
    checksum?: string;
    dHash?: string;
    centerDHash?: string;
    quadrantHashes?: string[];
    colorBins?: number[];
    screenSpoofScore?: number;
    isScreenSpoofRisk?: boolean;
    timestamp?: number;
  },
  options?: { cooldownMs?: number }
) {
  const registry = getStoredFingerprints();

  // Screen spoof flag check
  if (currentFp.isScreenSpoofRisk || (currentFp.screenSpoofScore && currentFp.screenSpoofScore >= 0.70)) {
    return {
      isDuplicate: true,
      similarity: currentFp.screenSpoofScore || 0.85,
      isScreenSpoof: true,
      detectionTier: 'screen_spoof',
      reason: 'Phát hiện dấu hiệu chụp lại ảnh từ màn hình thiết bị điện tử hoặc sọc Moiré quang học.',
      suggestedAction: 'Không đưa màn hình điện thoại hoặc máy tính trước camera. Hãy chụp vật thể rác thật!',
    };
  }

  if (!registry || registry.length === 0) {
    return { isDuplicate: false, similarity: 0 };
  }

  const now = currentFp.timestamp || Date.now();
  const cooldownMs = options?.cooldownMs ?? (5 * 60 * 1000);

  for (const record of registry) {
    const isExactChecksum = Boolean(record.checksum && currentFp.checksum && record.checksum === currentFp.checksum);
    const dSim = calculateServerHashSimilarity(currentFp.dHash, record.dHash);
    const centerSim = calculateServerHashSimilarity(currentFp.centerDHash, record.centerDHash || record.dHash);
    const colorSim = record.colorBins && currentFp.colorBins
      ? calculateServerHistogramSimilarity(currentFp.colorBins, record.colorBins)
      : 0.85;

    let quadrantSim = dSim;
    if (currentFp.quadrantHashes && record.quadrantHashes && record.quadrantHashes.length === 4) {
      let qMatches = 0;
      for (let i = 0; i < 4; i++) {
        qMatches += calculateServerHashSimilarity(currentFp.quadrantHashes[i], record.quadrantHashes[i]);
      }
      quadrantSim = qMatches / 4;
    }

    const timeDiff = Math.max(0, now - record.timestamp);

    // TIER 1: Exact byte or hash match
    if (isExactChecksum || (dSim >= 0.98 && centerSim >= 0.98 && colorSim >= 0.98)) {
      return {
        isDuplicate: true,
        similarity: 1.0,
        timeSinceLastScanMs: timeDiff,
        isExactFileMatch: true,
        matchedRecord: record,
        detectionTier: 'exact_file',
        reason: `Tệp ảnh này trùng khớp hoàn toàn (100%) với mẫu "${record.itemName}" đã từng nhận điểm trên hệ thống.`,
        suggestedAction: 'Không dùng lại cùng một tệp ảnh để quét nhiều lần. Hãy chụp món rác thật ngoài đời!',
      };
    }

    // TIER 2: Modified image (cropped, zoomed, brightness-adjusted)
    const isModified =
      (centerSim >= 0.92 && colorSim >= 0.85) ||
      (dSim >= 0.88 && colorSim >= 0.88) ||
      (quadrantSim >= 0.90 && colorSim >= 0.86);

    if (isModified) {
      const sim = Math.round((centerSim * 0.45 + dSim * 0.35 + colorSim * 0.20) * 100);
      return {
        isDuplicate: true,
        similarity: sim / 100,
        timeSinceLastScanMs: timeDiff,
        isExactFileMatch: false,
        matchedRecord: record,
        detectionTier: 'modified_image',
        reason: `Phát hiện ảnh đã qua chỉnh sửa (độ sáng, phóng to/cắt cúp) từ mẫu "${record.itemName}" (${sim}% tương đồng).`,
        suggestedAction: 'Không chỉnh sửa ảnh cũ để gian lận tích điểm. Hãy đưa vật thể rác mới vào khung quét!',
      };
    }

    // TIER 3: Same physical object re-scanned within cooldown
    if (timeDiff < cooldownMs && dSim >= 0.80 && centerSim >= 0.80 && colorSim >= 0.82) {
      const sim = Math.round((dSim * 0.4 + centerSim * 0.3 + colorSim * 0.3) * 100);
      const timeStr = timeDiff < 60000 ? `${Math.round(timeDiff / 1000)}s trước` : `${Math.round(timeDiff / 60000)}p trước`;
      return {
        isDuplicate: true,
        similarity: sim / 100,
        timeSinceLastScanMs: timeDiff,
        isExactFileMatch: false,
        matchedRecord: record,
        detectionTier: 'same_physical_object',
        reason: `Vật thể này trùng khớp ${sim}% với món "${record.itemName}" vừa được quét và tích điểm (${timeStr}).`,
        suggestedAction: 'Mỗi món rác chỉ được tích điểm 1 lần duy nhất! Vui lòng bỏ rác vào thùng trước khi quét món mới.',
      };
    }

    // TIER 4: Different objects of same category (e.g. 2 different bottles) are ALLOWED!
  }

  return { isDuplicate: false, similarity: 0 };
}

// Preload existing Supabase players and reports into memory on startup
export async function initStore(): Promise<void> {
  loadDataFromDisk();
  await Promise.allSettled([
    syncLeaderboardFromSupabase(),
    syncWasteReportsFromSupabase(),
  ]);
  console.log(`[EcoSort Store] Initialized with ${cachedData.players.length} players, ${cachedData.reports?.length || 0} waste reports and ${cachedData.fingerprints?.length || 0} anti-cheat fingerprints.`);
}

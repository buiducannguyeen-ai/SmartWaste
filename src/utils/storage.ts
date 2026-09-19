import { LeaderboardEntry, UserProfile, WasteHistoryRecord } from '../types';

const STORAGE_KEYS = {
  USER_PROFILE: 'ecosort_user_profile',
  LEADERBOARD: 'ecosort_leaderboard',
  HISTORY: 'ecosort_history',
  REGISTERED_ACCOUNTS: 'ecosort_registered_accounts',
};

export interface SavedAccountItem {
  email: string;
  name: string;
  organization?: string;
  avatar?: string;
  lastLogin: number;
}

export function loadSavedAccounts(): SavedAccountItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REGISTERED_ACCOUNTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRegisteredAccount(item: {
  email: string;
  name: string;
  organization?: string;
  avatar?: string;
}) {
  if (!item.email || !item.email.includes('@')) return;
  try {
    const existing = loadSavedAccounts();
    const cleanEmail = item.email.trim().toLowerCase();
    const filtered = existing.filter((a) => a.email.toLowerCase() !== cleanEmail);
    const updated: SavedAccountItem[] = [
      {
        email: cleanEmail,
        name: item.name.trim(),
        organization: item.organization?.trim(),
        avatar: item.avatar || '🌱',
        lastLogin: Date.now(),
      },
      ...filtered,
    ].slice(0, 15); // Lưu tối đa 15 tài khoản gần nhất
    localStorage.setItem(STORAGE_KEYS.REGISTERED_ACCOUNTS, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save account memory', e);
  }
}

export function removeSavedAccount(emailToRemove: string) {
  try {
    const existing = loadSavedAccounts();
    const cleanEmail = emailToRemove.trim().toLowerCase();
    const updated = existing.filter((a) => a.email.toLowerCase() !== cleanEmail);
    localStorage.setItem(STORAGE_KEYS.REGISTERED_ACCOUNTS, JSON.stringify(updated));
  } catch (e) {}
}

export const DEFAULT_AVATARS = [
  '🌱', '🤖', '🦊', '🦉', '🐻‍❄️', '🚀', '♻️', '🌍', '🐢', '⚡'
];

// No fake or mock data: Leaderboard starts empty and is populated purely from online Supabase database
export const INITIAL_LEADERBOARD: LeaderboardEntry[] = [];

export function getLevelTitle(points: number): string {
  if (points >= 50) return 'Đại Sứ Hành Tinh Xanh';
  if (points >= 35) return 'Hiệp Sĩ Môi Trường';
  if (points >= 20) return 'Chuyên Gia Tái Chế';
  if (points >= 10) return 'Chiến Binh Phân Loại';
  return 'Tập Sự Sinh Thái STEM';
}

export function loadUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveUserProfile(user: UserProfile) {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save user profile', e);
  }
}

export function clearUserProfile() {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
  } catch (e) {}
}

export function loadLeaderboard(currentUser?: UserProfile | null): LeaderboardEntry[] {
  let list: LeaderboardEntry[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LEADERBOARD);
    if (raw) {
      list = JSON.parse(raw);
    } else {
      list = [...INITIAL_LEADERBOARD];
    }
  } catch {
    list = [...INITIAL_LEADERBOARD];
  }

  // Ensure current user is in or updated in leaderboard
  if (currentUser) {
    const existingIndex = list.findIndex((x) => x.id === currentUser.id);
    const currentEntry: LeaderboardEntry = {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      organization: currentUser.organization || 'Thí sinh STEM',
      totalPoints: currentUser.totalPoints,
      correctCount: currentUser.correctCount || 0,
      avatar: currentUser.avatar || '🌱',
      levelTitle: getLevelTitle(currentUser.totalPoints),
      lastActive: Date.now(),
      isCurrentUser: true,
    };

    if (existingIndex >= 0) {
      list[existingIndex] = currentEntry;
    } else {
      list.push(currentEntry);
    }
  }

  // Sort descending by points, then by lastActive
  list.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.lastActive - a.lastActive;
  });

  return list;
}

export function saveLeaderboard(list: LeaderboardEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.LEADERBOARD, JSON.stringify(list));
  } catch (e) {}
}

export function resetLeaderboardToDefaults(currentUser?: UserProfile | null): LeaderboardEntry[] {
  const list = [...INITIAL_LEADERBOARD];
  if (currentUser) {
    list.push({
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      organization: currentUser.organization || 'Thí sinh STEM',
      totalPoints: currentUser.totalPoints,
      correctCount: currentUser.correctCount || 0,
      avatar: currentUser.avatar || '🌱',
      levelTitle: getLevelTitle(currentUser.totalPoints),
      lastActive: Date.now(),
      isCurrentUser: true,
    });
  }
  list.sort((a, b) => b.totalPoints - a.totalPoints);
  saveLeaderboard(list);
  return list;
}

export function loadHistory(): WasteHistoryRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveHistory(records: WasteHistoryRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(records.slice(0, 100))); // keep latest 100
  } catch (e) {}
}

export function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
  } catch (e) {}
}

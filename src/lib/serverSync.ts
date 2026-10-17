import { LeaderboardEntry, UserProfile, WasteCategory, MisclassificationFeedbackPayload, PreparationStep } from '../types';
import { isSupabaseConfigured, fetchOnlineLeaderboard } from './supabase.ts';

export interface RecordWastePayload {
  scanId?: string;
  userId?: string;
  userName: string;
  email?: string;
  organization?: string;
  avatar?: string;
  itemName: string;
  category: WasteCategory;
  points: number;
  confidence?: number;
  source?: string;
  preparationSteps?: PreparationStep[];
  specialHandlingNotice?: string;
  fingerprint?: any;
}

export interface RecordResult {
  success: boolean;
  alreadyProcessed?: boolean;
  totalPoints?: number;
  correctCount?: number;
  leaderboard?: LeaderboardEntry[];
  error?: string;
}

import { getSessionToken } from './authApi';

/**
 * Record waste classification points on the central server.
 * Instantly broadcasts to all other devices via SSE.
 */
export async function recordPointsOnServer(payload: RecordWastePayload): Promise<RecordResult> {
  try {
    const sessionToken = getSessionToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const res = await fetch('/api/leaderboard/record', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errData.error || `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      alreadyProcessed: data.alreadyProcessed,
      totalPoints: data.totalPoints,
      correctCount: data.correctCount,
      leaderboard: data.leaderboard,
    };
  } catch (err: any) {
    console.warn('Network notice recording points on server:', err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Fetch current real-time leaderboard across all devices.
 */
export async function fetchServerLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.leaderboard)) {
        return data.leaderboard;
      }
    }
    // Fallback directly to Supabase if API is unreachable or returned 404
    const online = await fetchOnlineLeaderboard().catch(() => ({ entries: [] }));
    return online.entries || [];
  } catch (err) {
    const online = await fetchOnlineLeaderboard().catch(() => ({ entries: [] }));
    return online.entries || [];
  }
}

/**
 * Register or update player profile in the central server database.
 */
export async function registerPlayerOnServer(user: UserProfile): Promise<boolean> {
  try {
    const res = await fetch('/api/players/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        name: user.name,
        email: user.email,
        organization: user.organization,
        avatar: user.avatar,
        totalPoints: user.totalPoints,
      }),
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

let sseDisabledGlobally = false;

/**
 * Subscribe to Real-Time stream or controlled polling for multi-device updates.
 * Prioritizes Supabase Realtime when available, with controlled polling fallback and exponential backoff.
 */
export function listenToLeaderboardStream(
  onUpdate: (leaderboard: LeaderboardEntry[], eventType: string) => void
): () => void {
  let eventSource: EventSource | null = null;
  let isClosed = false;
  let pollTimeout: any = null;
  let consecutiveErrors = 0;

  // Controlled polling with exponential backoff if errors occur
  function scheduleNextPoll(delayMs = 15000) {
    if (isClosed) return;
    pollTimeout = setTimeout(async () => {
      if (isClosed) return;
      try {
        const res = await fetch('/api/leaderboard');
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.leaderboard)) {
            consecutiveErrors = 0;
            onUpdate(data.leaderboard, 'poll');
          }
          scheduleNextPoll(15000); // 15 seconds standard polling
        } else {
          const online = await fetchOnlineLeaderboard().catch(() => ({ entries: [] }));
          if (online.entries && online.entries.length > 0) {
            onUpdate(online.entries, 'poll-supabase');
          }
          consecutiveErrors++;
          // Exponential backoff up to 60s. If 3 consecutive errors, pause polling
          if (consecutiveErrors < 3) {
            scheduleNextPoll(Math.min(60000, 15000 * Math.pow(2, consecutiveErrors)));
          }
        }
      } catch (e) {
        const online = await fetchOnlineLeaderboard().catch(() => ({ entries: [] }));
        if (online.entries && online.entries.length > 0) {
          onUpdate(online.entries, 'poll-supabase');
        }
        consecutiveErrors++;
        if (consecutiveErrors < 3) {
          scheduleNextPoll(Math.min(60000, 15000 * Math.pow(2, consecutiveErrors)));
        }
      }
    }, delayMs);
  }

  // If Supabase Realtime is configured and active, it handles live updates via WebSockets
  const hasSupabase = isSupabaseConfigured();

  if (!hasSupabase && !sseDisabledGlobally && typeof EventSource !== 'undefined') {
    try {
      eventSource = new EventSource('/api/leaderboard/stream');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && Array.isArray(data.leaderboard)) {
            onUpdate(data.leaderboard, data.type || 'update');
          }
        } catch (e) {
          // Ignore non-json heartbeats
        }
      };

      eventSource.onerror = () => {
        // If SSE encounters an error (like 404 on Vercel), immediately close and disable SSE
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        sseDisabledGlobally = true;
      };
    } catch (e) {
      sseDisabledGlobally = true;
    }
  }

  // Start controlled polling
  scheduleNextPoll(hasSupabase ? 20000 : 15000);

  return () => {
    isClosed = true;
    if (pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

/**
 * Reset all players' points and stats to 0 across Supabase and server
 */
export async function resetAllPlayersPointsOnServer(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  leaderboard?: LeaderboardEntry[];
}> {
  try {
    const res = await fetch('/api/players/reset-all-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Lỗi kết nối khi đặt lại điểm',
    };
  }
}

/**
 * Submit misclassification feedback from student for STEM review.
 * Does NOT auto-promote suggestions to ground-truth labels.
 */
export async function submitMisclassificationFeedback(payload: MisclassificationFeedbackPayload): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/feedback/misclassification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Lỗi kết nối khi gửi phản ánh',
    };
  }
}

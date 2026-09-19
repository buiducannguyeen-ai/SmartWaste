import { LeaderboardEntry, UserProfile, WasteCategory } from '../types';

export interface RecordWastePayload {
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
}

export interface RecordResult {
  success: boolean;
  totalPoints?: number;
  correctCount?: number;
  leaderboard?: LeaderboardEntry[];
  error?: string;
}

/**
 * Record waste classification points on the central server.
 * Instantly broadcasts to all other devices via SSE.
 */
export async function recordPointsOnServer(payload: RecordWastePayload): Promise<RecordResult> {
  try {
    const res = await fetch('/api/leaderboard/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.leaderboard)) {
      return data.leaderboard;
    }
    return [];
  } catch (err) {
    console.warn('Network notice fetching server leaderboard:', err);
    return [];
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

/**
 * Subscribe to Real-Time SSE Stream for immediate multi-device updates.
 * Fires whenever any connected phone, laptop, or tablet scores points.
 */
export function listenToLeaderboardStream(
  onUpdate: (leaderboard: LeaderboardEntry[], eventType: string) => void
): () => void {
  let eventSource: EventSource | null = null;
  let isClosed = false;
  let reconnectTimeout: any = null;

  function connect() {
    if (isClosed) return;

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
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isClosed) {
          // Reconnect after 3 seconds
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    } catch (e) {
      if (!isClosed) {
        reconnectTimeout = setTimeout(connect, 4000);
      }
    }
  }

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
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

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { LeaderboardEntry, UserProfile, WasteCategory } from '../types';
import { getLevelTitle } from '../utils/storage';

// Read public environment variables for Supabase safely with provided project credentials
const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};

// Supabase URL & Anon Key default to empty so old project credentials are completely purged
export const DEFAULT_SUPABASE_URL = 'https://cuxalsutwmzowwhdrjrq.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1eGFsc3V0d216b3d3aGRyanJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Mzk4MDQsImV4cCI6MjEwNTExNTgwNH0.NwNnkBZs_aYCV0MWpP2ZGotM5UuM2C9RH4rMVQPLf-M';

export function getEffectiveSupabaseConfig() {
  // Purge any legacy cached keys from old project qzoxbcsxnjzdsodfxhfl
  if (typeof window !== 'undefined') {
    const savedUrl = localStorage.getItem('STEM_SUPABASE_URL');
    if (savedUrl && savedUrl.includes('qzoxbcsxnjzdsodfxhfl')) {
      localStorage.removeItem('STEM_SUPABASE_URL');
      localStorage.removeItem('STEM_SUPABASE_ANON_KEY');
    }
  }

  const url =
    metaEnv.VITE_SUPABASE_URL ||
    (typeof window !== 'undefined' ? localStorage.getItem('STEM_SUPABASE_URL') : null) ||
    DEFAULT_SUPABASE_URL;

  const anonKey =
    metaEnv.VITE_SUPABASE_ANON_KEY ||
    (typeof window !== 'undefined' ? localStorage.getItem('STEM_SUPABASE_ANON_KEY') : null) ||
    DEFAULT_SUPABASE_ANON_KEY;

  return { url: (url || '').trim(), anonKey: (anonKey || '').trim() };
}

export function updateSupabaseConfig(newUrl: string, newAnonKey: string) {
  if (typeof window !== 'undefined') {
    if (newUrl) localStorage.setItem('STEM_SUPABASE_URL', newUrl.trim());
    else localStorage.removeItem('STEM_SUPABASE_URL');

    if (newAnonKey) localStorage.setItem('STEM_SUPABASE_ANON_KEY', newAnonKey.trim());
    else localStorage.removeItem('STEM_SUPABASE_ANON_KEY');
  }
  supabaseInstance = null;
}

export const isSupabaseConfigured = (): boolean => {
  const { url, anonKey } = getEffectiveSupabaseConfig();
  return Boolean(
    url &&
    anonKey &&
    url.startsWith('http') &&
    !url.includes('placeholder') &&
    !url.includes('qzoxbcsxnjzdsodfxhfl')
  );
};

// Lazy initialization of Supabase client
let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const { url, anonKey } = getEffectiveSupabaseConfig();
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseInstance;
};

// Mapping database row from public.players to UserProfile
export interface PlayerRow {
  id: string;
  username: string;
  email: string;
  total_points: number;
  correct_count: number;
  organic_count: number;
  recyclable_count: number;
  inorganic_count: number;
  avatar: string;
  organization: string;
  created_at: string;
  updated_at: string;
}

export function playerRowToUserProfile(row: PlayerRow): UserProfile {
  return {
    id: row.id,
    name: row.username || 'Thí sinh STEM',
    email: row.email,
    organization: row.organization || 'Khối Sáng Tạo STEM',
    avatar: row.avatar || '🌱',
    totalPoints: Number(row.total_points) || 0,
    correctCount: Number(row.correct_count) || 0,
    organicCount: Number(row.organic_count) || 0,
    recyclableCount: Number(row.recyclable_count) || 0,
    inorganicCount: Number(row.inorganic_count) || 0,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export function playerRowToLeaderboardEntry(row: PlayerRow, currentUserId?: string): LeaderboardEntry {
  const points = Number(row.total_points) || 0;
  return {
    id: row.id,
    name: row.username || 'Thí sinh STEM',
    email: row.email,
    organization: row.organization || 'Khối Sáng Tạo STEM',
    totalPoints: points,
    correctCount: Number(row.correct_count) || 0,
    organicCount: Number(row.organic_count) || 0,
    recyclableCount: Number(row.recyclable_count) || 0,
    inorganicCount: Number(row.inorganic_count) || 0,
    avatar: row.avatar || '🌱',
    levelTitle: getLevelTitle(points),
    lastActive: new Date(row.updated_at || row.created_at).getTime(),
    isCurrentUser: currentUserId ? row.id === currentUserId : false,
  };
}

// 1. SUPABASE AUTHENTICATION: SIGN UP
export async function signUpWithSupabase(
  email: string,
  password: string,
  username: string,
  organization: string,
  avatar: string
): Promise<{ user: UserProfile | null; error: string | null }> {
  const client = getSupabase();
  if (!client) {
    return {
      user: null,
      error: 'Chưa cấu hình Supabase URL và API Anon Key. Vui lòng kiểm tra cài đặt biến môi trường.',
    };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          username: username.trim(),
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
          avatar: avatar || '🌱',
        },
      },
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Không thể tạo tài khoản người dùng.' };
    }

    // Retrieve or wait for player record created by trigger
    // Small retry delay in case trigger takes a moment
    let profile = await fetchPlayerProfile(data.user.id);
    if (!profile) {
      // Manual fallback insert if trigger wasn't run yet
      const { data: inserted, error: insertError } = await client
        .from('players')
        .upsert({
          id: data.user.id,
          username: username.trim(),
          email: email.trim(),
          total_points: 0,
          correct_count: 0,
          organic_count: 0,
          recyclable_count: 0,
          inorganic_count: 0,
          avatar: avatar || '🌱',
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
        })
        .select()
        .single();

      if (!insertError && inserted) {
        profile = playerRowToUserProfile(inserted as PlayerRow);
      } else {
        profile = {
          id: data.user.id,
          name: username.trim(),
          email: email.trim(),
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
          avatar: avatar || '🌱',
          totalPoints: 0,
          correctCount: 0,
          organicCount: 0,
          recyclableCount: 0,
          inorganicCount: 0,
          createdAt: Date.now(),
        };
      }
    }

    return { user: profile, error: null };
  } catch (err: unknown) {
    return {
      user: null,
      error: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đăng ký.',
    };
  }
}

// 2. SUPABASE AUTHENTICATION: SIGN IN
export async function signInWithSupabase(
  email: string,
  password: string
): Promise<{ user: UserProfile | null; error: string | null }> {
  const client = getSupabase();
  if (!client) {
    return {
      user: null,
      error: 'Chưa cấu hình Supabase URL và API Anon Key.',
    };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Không tìm thấy thông tin tài khoản.' };
    }

    const profile = await fetchPlayerProfile(data.user.id);
    if (!profile) {
      // Create record if missing
      const fallback: UserProfile = {
        id: data.user.id,
        name: data.user.user_metadata?.username || email.split('@')[0],
        email: data.user.email || email,
        organization: data.user.user_metadata?.organization || 'Khối Sáng Tạo STEM',
        avatar: data.user.user_metadata?.avatar || '🌱',
        totalPoints: 0,
        correctCount: 0,
        organicCount: 0,
        recyclableCount: 0,
        inorganicCount: 0,
        createdAt: Date.now(),
      };
      return { user: fallback, error: null };
    }

    return { user: profile, error: null };
  } catch (err: unknown) {
    return {
      user: null,
      error: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đăng nhập.',
    };
  }
}

// 3. SIGN OUT
export async function signOutSupabase(): Promise<void> {
  const client = getSupabase();
  if (client) {
    await client.auth.signOut();
  }
}

// 4. FETCH CURRENT PLAYER PROFILE
export async function fetchPlayerProfile(userId: string): Promise<UserProfile | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('players')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return playerRowToUserProfile(data as PlayerRow);
  } catch {
    return null;
  }
}

// 5. FETCH ONLINE LEADERBOARD (SORTED BY TOTAL_POINTS DESC, THEN CORRECT_COUNT DESC)
export async function fetchOnlineLeaderboard(currentUserId?: string): Promise<{
  entries: LeaderboardEntry[];
  error: string | null;
}> {
  const client = getSupabase();
  if (!client) {
    return { entries: [], error: 'not_configured' };
  }

  try {
    const { data, error } = await client
      .from('players')
      .select('*')
      .order('total_points', { ascending: false })
      .order('correct_count', { ascending: false })
      .limit(100);

    if (error) {
      return { entries: [], error: error.message };
    }

    const rows = (data || []) as PlayerRow[];
    // Strictly sort by total_points DESC, then correct_count DESC, then updated_at DESC
    rows.sort((a, b) => {
      const ptsA = Number(a.total_points) || 0;
      const ptsB = Number(b.total_points) || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      const cntA = Number(a.correct_count) || 0;
      const cntB = Number(b.correct_count) || 0;
      if (cntB !== cntA) return cntB - cntA;
      const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return timeB - timeA;
    });

    const entries = rows.map((row) => playerRowToLeaderboardEntry(row, currentUserId));
    return { entries, error: null };
  } catch (err: unknown) {
    return {
      entries: [],
      error: err instanceof Error ? err.message : 'Lỗi truy vấn cơ sở dữ liệu',
    };
  }
}

// 6. RECORD WASTE CLASSIFICATION (SECURITY DEFINER RPC CALL & TABLE UPDATE)
// Authoritative Supabase Database sync: When any player is awarded points,
// the new score is written directly to the database and leaderboard updates immediately.
export async function recordClassificationOnline(params: {
  itemName: string;
  category: WasteCategory;
  points: number;
  source: string;
  confidence?: number;
  userId?: string;
  userName?: string;
  email?: string;
  organization?: string;
  avatar?: string;
}): Promise<{
  success: boolean;
  totalPoints?: number;
  correctCount?: number;
  error?: string | null;
}> {
  const client = getSupabase();
  if (!client) {
    return { success: false, error: 'Chưa kết nối Supabase' };
  }

  try {
    // 1. Try 5-parameter RPC (active in Supabase security definer)
    let { data, error } = await client.rpc('record_waste_classification', {
      p_item_name: params.itemName,
      p_category: params.category,
      p_points: params.points,
      p_source: params.source,
      p_confidence: params.confidence || 0.95,
    });

    // 2. If not found or error, try 6-parameter RPC with p_user_id
    if (error) {
      const rpc6 = await client.rpc('record_waste_classification', {
        p_item_name: params.itemName,
        p_category: params.category,
        p_points: params.points,
        p_source: params.source,
        p_confidence: params.confidence || 0.95,
        p_user_id: params.userId || params.userName,
      });
      if (!rpc6.error) {
        data = rpc6.data;
        error = null;
      }
    }

    // 3. Fallback: Direct table update in Supabase players table
    if (error && params.userId) {
      try {
        const { data: pData } = await client
          .from('players')
          .select('total_points, correct_count, organic_count, recyclable_count, inorganic_count')
          .eq('id', params.userId)
          .maybeSingle();

        const currentPts = Number(pData?.total_points) || 0;
        const currentCnt = Number(pData?.correct_count) || 0;
        const newPts = currentPts + params.points;
        const newCnt = currentCnt + 1;
        const newOrg = (Number(pData?.organic_count) || 0) + (params.category === 'organic' ? 1 : 0);
        const newRec = (Number(pData?.recyclable_count) || 0) + (params.category === 'recyclable' ? 1 : 0);
        const newIno = (Number(pData?.inorganic_count) || 0) + (params.category === 'inorganic' ? 1 : 0);

        const { error: updErr } = await client.from('players').update({
          total_points: newPts,
          correct_count: newCnt,
          organic_count: newOrg,
          recyclable_count: newRec,
          inorganic_count: newIno,
          updated_at: new Date().toISOString(),
        }).eq('id', params.userId);

        if (!updErr) {
          return {
            success: true,
            totalPoints: newPts,
            correctCount: newCnt,
          };
        }
      } catch (tableErr) {
        console.warn('Direct table update notice:', tableErr);
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      totalPoints: data?.total_points,
      correctCount: data?.correct_count,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Không thể ghi nhận điểm trực tuyến',
    };
  }
}

// 7. REALTIME LEADERBOARD SUBSCRIPTION
export function subscribeToLeaderboardChanges(
  onTableChange: () => void
): RealtimeChannel | null {
  const client = getSupabase();
  if (!client) return null;

  try {
    // Generate a unique channel topic per subscription instance to avoid callback conflicts across re-renders
    const channelName = `realtime:public:players:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        () => {
          onTableChange();
        }
      )
      .subscribe();

    return channel;
  } catch (err) {
    console.error('Failed to subscribe to Supabase Realtime', err);
    return null;
  }
}

// 8. SUPABASE BUILT-IN EMAIL OTP (TỰ ĐỘNG GỬI MÃ PIN QUA HỆ THỐNG SUPABASE AUTH, KHÔNG CẦN CẤU HÌNH SMTP RIÊNG)
export async function sendSupabaseOtp(
  email: string,
  metadata?: { username?: string; organization?: string; avatar?: string }
): Promise<{ success: boolean; error: string | null }> {
  const client = getSupabase();
  if (!client) {
    return {
      success: false,
      error: 'Chưa kết nối Supabase Project.',
    };
  }

  try {
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        data: metadata || {},
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Lỗi gửi mã qua Supabase Auth OTP',
    };
  }
}

export async function verifySupabaseOtp(
  email: string,
  token: string,
  metadata?: { username?: string; organization?: string; avatar?: string }
): Promise<{ user: UserProfile | null; error: string | null }> {
  const client = getSupabase();
  if (!client) {
    return { user: null, error: 'Chưa kết nối Supabase Project.' };
  }

  try {
    const { data, error } = await client.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Không nhận diện được tài khoản sau xác thực.' };
    }

    let profile = await fetchPlayerProfile(data.user.id);
    if (!profile) {
      const name = metadata?.username || data.user.user_metadata?.username || email.split('@')[0];
      const org = metadata?.organization || data.user.user_metadata?.organization || 'Khối Sáng Tạo STEM';
      const avatar = metadata?.avatar || data.user.user_metadata?.avatar || '🌱';

      try {
        await client.from('players').upsert({
          id: data.user.id,
          username: name,
          email: email.trim(),
          organization: org,
          avatar: avatar,
          total_points: 0,
          correct_count: 0,
          organic_count: 0,
          recyclable_count: 0,
          inorganic_count: 0,
        });
      } catch (upsertErr) {
        console.warn('Upsert player after OTP note:', upsertErr);
      }

      profile = {
        id: data.user.id,
        name,
        email: email.trim(),
        organization: org,
        avatar,
        totalPoints: 0,
        correctCount: 0,
        organicCount: 0,
        recyclableCount: 0,
        inorganicCount: 0,
        createdAt: Date.now(),
        isEmailVerified: true,
      };
    } else {
      profile.isEmailVerified = true;
    }

    return { user: profile, error: null };
  } catch (err: unknown) {
    return {
      user: null,
      error: err instanceof Error ? err.message : 'Lỗi xác minh mã OTP với Supabase.',
    };
  }
}

/**
 * Sign in using Google OAuth via Supabase
 */
export async function signInWithGoogle(): Promise<{ error?: string }> {
  const client = getSupabase();
  if (!client) {
    return { error: 'Chưa cấu hình kết nối Supabase Project.' };
  }
  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      return { error: error.message };
    }
    return {};
  } catch (err: any) {
    return { error: err?.message || 'Lỗi mở trang đăng nhập Google' };
  }
}

/**
 * Test live connection to Supabase and check database tables
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  latencyMs?: number;
  tablesFound?: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { connected: false, error: 'Chưa cấu hình Supabase URL hoặc Anon Key' };
  }
  const client = getSupabase();
  if (!client) {
    return { connected: false, error: 'Không thể khởi tạo Supabase Client' };
  }
  const start = performance.now();
  try {
    const { error } = await client
      .from('players')
      .select('id')
      .limit(1);

    const latencyMs = Math.round(performance.now() - start);
    if (error) {
      if (error.code === '42P01') {
        return {
          connected: true,
          latencyMs,
          tablesFound: false,
          error: 'Kết nối mạng thành công nhưng chưa nạp SQL Schema (bảng public.players chưa được tạo).',
        };
      }
      return {
        connected: false,
        latencyMs,
        error: error.message || 'Lỗi truy vấn bảng Supabase',
      };
    }
    return {
      connected: true,
      latencyMs,
      tablesFound: true,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      connected: false,
      latencyMs,
      error: err?.message || 'Không thể kết nối mạng đến Supabase',
    };
  }
}

export interface SupabaseAuthSubscription {
  (): void;
  unsubscribe: () => void;
}

/**
 * Listen for Supabase auth state changes (such as returning from Google OAuth redirect)
 */
export function initSupabaseAuthListener(
  onUserDetected: (user: UserProfile) => void
): SupabaseAuthSubscription | null {
  const client = getSupabase();
  if (!client) return null;

  // 1. Check current session immediately (for redirect handling after Google OAuth)
  client.auth.getSession().then(async ({ data, error }) => {
    if (error || !data?.session?.user) return;
    const authUser = data.session.user;
    let profile = await fetchPlayerProfile(authUser.id);
    if (!profile) {
      const meta = authUser.user_metadata || {};
      const name = meta.full_name || meta.name || meta.username || authUser.email?.split('@')[0] || 'Người dùng Google';
      const email = authUser.email || '';
      const avatar = meta.avatar_url || meta.picture || '🌱';
      const org = meta.organization || 'Khối Sáng Tạo STEM';

      try {
        await client.from('players').upsert({
          id: authUser.id,
          username: name,
          email,
          avatar,
          organization: org,
          total_points: 0,
          correct_count: 0,
          organic_count: 0,
          recyclable_count: 0,
          inorganic_count: 0,
        });
      } catch (e) {
        console.warn('Upsert Google profile notice:', e);
      }

      profile = {
        id: authUser.id,
        name,
        email,
        organization: org,
        avatar,
        totalPoints: 0,
        correctCount: 0,
        organicCount: 0,
        recyclableCount: 0,
        inorganicCount: 0,
        createdAt: Date.now(),
        isGoogleVerified: true,
        isEmailVerified: true,
      };
    } else {
      profile.isGoogleVerified = true;
      profile.isEmailVerified = true;
    }
    onUserDetected(profile);
  }).catch((e) => console.warn('Supabase getSession notice:', e));

  // 2. Listen to state changes
  const { data: authListener } = client.auth.onAuthStateChange(async (event, session) => {
    if (session?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
      const authUser = session.user;
      let profile = await fetchPlayerProfile(authUser.id);
      if (profile) {
        profile.isGoogleVerified = authUser.app_metadata?.provider === 'google';
        profile.isEmailVerified = true;
        onUserDetected(profile);
      }
    }
  });

  const unsubscribeFn = () => {
    authListener?.subscription?.unsubscribe();
  };

  const cleanup: SupabaseAuthSubscription = Object.assign(unsubscribeFn, {
    unsubscribe: unsubscribeFn,
  });

  return cleanup;
}

import { createClient } from '@supabase/supabase-js';

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

function getSupabase() {
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const supabase = getSupabase();
    let leaderboard: any[] = [];

    if (supabase) {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('total_points', { ascending: false })
        .order('correct_count', { ascending: false })
        .limit(100);

      if (!error && Array.isArray(data)) {
        leaderboard = data.map((row) => ({
          id: row.id,
          name: row.username || 'Thí sinh STEM',
          email: row.email,
          organization: row.organization || 'Khối Sáng Tạo STEM',
          avatar: row.avatar || '🌱',
          totalPoints: row.total_points ?? 0,
          correctCount: row.correct_count ?? 0,
          organicCount: row.organic_count ?? 0,
          recyclableCount: row.recyclable_count ?? 0,
          inorganicCount: row.inorganic_count ?? 0,
          levelTitle: row.total_points >= 100 ? 'Đại Sứ Hành Tinh Xanh' : row.total_points >= 60 ? 'Chuyên Gia Tái Chế STEM' : row.total_points >= 30 ? 'Hiệp Sĩ Môi Trường' : 'Tập Sự Phân Loại',
          lastActive: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
        }));
      }
    }

    return res.status(200).json({
      success: true,
      leaderboard,
      count: leaderboard.length,
      serverTime: Date.now(),
    });
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      leaderboard: [],
      count: 0,
      serverTime: Date.now(),
      notice: err?.message,
    });
  }
}

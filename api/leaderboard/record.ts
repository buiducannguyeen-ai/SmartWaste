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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { userName, itemName, category, points = 1 } = body || {};

    if (!userName || !itemName || !category) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin người chơi hoặc rác quét (userName, itemName, category required)',
      });
    }

    const supabase = getSupabase();
    if (supabase) {
      // Sync to Supabase
      const pts = Number(points) || 1;
      const { data: existingUser } = await supabase
        .from('players')
        .select('*')
        .eq('username', userName)
        .maybeSingle();

      if (existingUser) {
        await supabase
          .from('players')
          .update({
            total_points: (existingUser.total_points || 0) + pts,
            correct_count: (existingUser.correct_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingUser.id);
      } else {
        await supabase.from('players').insert({
          id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          username: userName,
          email: `${userName.toLowerCase().replace(/[^a-z0-9]/g, '')}@ecosort.stem`,
          total_points: pts,
          correct_count: 1,
          avatar: body.avatar || '🌱',
          organization: body.organization || 'Khối Sáng Tạo STEM',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    return res.status(200).json({
      success: true,
      alreadyProcessed: false,
      pointsAwarded: Number(points) || 1,
    });
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      alreadyProcessed: false,
      pointsAwarded: 1,
      notice: err?.message,
    });
  }
}

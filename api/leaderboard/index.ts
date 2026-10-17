import { syncLeaderboardFromSupabase, getLeaderboard } from '../../server/store.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    await syncLeaderboardFromSupabase();
    const list = getLeaderboard();
    return res.status(200).json({
      success: true,
      leaderboard: list,
      count: list.length,
      serverTime: Date.now(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Lỗi truy xuất bảng xếp hạng' });
  }
}

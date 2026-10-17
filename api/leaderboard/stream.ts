import { getLeaderboard, syncLeaderboardFromSupabase } from '../../server/store.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    await syncLeaderboardFromSupabase();
  } catch (e) {
    // Ignore sync error on snapshot
  }

  const list = getLeaderboard();
  const initialPayload = JSON.stringify({
    type: 'init',
    leaderboard: list,
    timestamp: Date.now(),
  });

  res.write(`data: ${initialPayload}\n\n`);
  res.end();
}

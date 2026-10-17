import type { IncomingMessage, ServerResponse } from 'http';
import { getVerifiedUserSession } from '../../server/sessionManager.ts';
import { getScanQuota } from '../../server/store.ts';

export default async function handler(req: any, res: any) {
  // Support CORS if needed
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-session-token');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const session = getVerifiedUserSession(req);
    const quota = getScanQuota(session.userId);
    return res.status(200).json({
      success: true,
      userId: session.userId,
      isGuest: session.isGuest,
      ...quota,
      resetTime: '00:00 (Asia/Ho_Chi_Minh)',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Lỗi kiểm tra hạn mức' });
  }
}

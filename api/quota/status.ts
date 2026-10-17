import crypto from 'crypto';

function getVietnamDateKey(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-session-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers?.authorization || req.headers?.['x-session-token'] || '';
    const clientIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.headers?.['x-real-ip'] || '127.0.0.1';
    const cleanIp = clientIp.replace(/[^a-zA-Z0-9]/g, '_');
    const guestId = `guest_${cleanIp}_${crypto.createHash('md5').update(clientIp + getVietnamDateKey()).digest('hex').substring(0, 8)}`;

    return res.status(200).json({
      success: true,
      userId: authHeader ? 'verified_user' : guestId,
      isGuest: !authHeader,
      limit: 30,
      used: 0,
      remaining: 30,
      dateKey: getVietnamDateKey(),
      resetTime: '00:00 (Asia/Ho_Chi_Minh)',
    });
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      userId: 'guest',
      isGuest: true,
      limit: 30,
      used: 0,
      remaining: 30,
      dateKey: getVietnamDateKey(),
      resetTime: '00:00 (Asia/Ho_Chi_Minh)',
    });
  }
}

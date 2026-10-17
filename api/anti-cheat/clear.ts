import { clearAllStoredFingerprints } from '../../server/store.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    clearAllStoredFingerprints();
    return res.status(200).json({ success: true, message: 'Đã xóa toàn bộ sổ vân tay ảnh chống gian lận.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Lỗi xóa sổ vân tay' });
  }
}

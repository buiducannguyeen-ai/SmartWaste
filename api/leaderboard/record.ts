import { getVerifiedUserSession } from '../../server/sessionManager.ts';
import { recordClassification, addStoredFingerprint } from '../../server/store.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-token');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      scanId,
      userName,
      email,
      organization,
      avatar,
      itemName,
      category,
      points,
      confidence,
      source,
      preparationSteps,
      specialHandlingNotice,
    } = body || {};

    if (!userName || !itemName || !category) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin người chơi hoặc rác quét (userName, itemName, category required)',
      });
    }

    const userSession = getVerifiedUserSession(req);
    const verifiedUserId = userSession.userId;

    const result = recordClassification({
      scanId,
      userId: verifiedUserId,
      userName: userSession.name || userName,
      email: userSession.email || email,
      organization,
      avatar,
      itemName,
      category,
      points: Number(points) || 1,
      confidence: Number(confidence) || 0.95,
      source: source || 'webcam',
      preparationSteps,
      specialHandlingNotice,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Ghi nhận điểm thất bại.',
      });
    }

    if (result.success && !result.alreadyProcessed && body.fingerprint && typeof body.fingerprint === 'object') {
      try {
        addStoredFingerprint({
          id: body.fingerprint.id || `fp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          scanId,
          userId: verifiedUserId,
          userName: userSession.name || userName,
          itemName: result.player?.name ? itemName : 'Vật thể hợp lệ',
          category,
          points: result.pointsAwarded || Number(points) || 1,
          timestamp: body.fingerprint.timestamp || Date.now(),
          checksum: body.fingerprint.checksum || '',
          dHash: body.fingerprint.dHash || '',
          aHash: body.fingerprint.aHash || '',
          centerDHash: body.fingerprint.centerDHash,
          quadrantHashes: body.fingerprint.quadrantHashes,
          colorBins: body.fingerprint.colorBins,
          thumbnail: body.fingerprint.thumbnail,
          detectionTier: body.fingerprint.detectionTier,
          screenSpoofScore: body.fingerprint.screenSpoofScore,
        });
      } catch (fpErr) {
        console.warn('Notice registering fingerprint on server:', fpErr);
      }
    }

    return res.status(200).json({
      success: true,
      alreadyProcessed: result.alreadyProcessed || false,
      player: result.player,
      totalPoints: result.player?.totalPoints || 0,
      correctCount: result.player?.correctCount || 0,
      leaderboard: result.leaderboard,
    });
  } catch (err: any) {
    console.error('Lỗi tích điểm đa thiết bị:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi xử lý tích điểm' });
  }
}

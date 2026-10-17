import { GoogleGenAI, Type } from '@google/genai';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

function getAI(): GoogleGenAI | null {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
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
    const { image, hint, isRescanVerification, originalItemName } = body || {};

    if (!image) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu hình ảnh (base64 image required)' });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(503).json({
        success: false,
        error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel. Vui lòng thêm biến môi trường GEMINI_API_KEY trong Vercel Settings.',
      });
    }

    let base64Data = image;
    let mimeType = 'image/jpeg';

    if (image.includes(',')) {
      const parts = image.split(',');
      base64Data = parts[1];
      const match = parts[0].match(/data:(.*?);base64/);
      if (match) {
        mimeType = match[1];
      }
    }

    const isVerificationMode = Boolean(isRescanVerification);
    const prompt = isVerificationMode
      ? `Bạn là chuyên gia AI giám định STEM kiểm tra nghiệm thu chai/ly rác tái chế sau khi học sinh đã đi trút nước.
Vật thể ban đầu trước đó: "${originalItemName || 'Chai nhựa / Ly nước'}".
Nhiệm vụ: Phân tích hình ảnh này và xác định xem vật thể ĐÃ ĐƯỢC ĐỔ RỖNG NƯỚC / CHẤT LỎNG HOÀN TOÀN hay CHƯA.
Nếu đã rỗng: verificationPassed = true, points = 2, binColor = "yellow".`
      : `Bạn là chuyên gia AI phân loại rác thông minh cho dự án giáo dục STEM môi trường học đường SmartWaste.
Hãy phân tích hình ảnh này và phân loại theo 3 nhóm:
- 1. "organic" (Rác hữu cơ) -> 1 ĐIỂM: Vỏ trái cây, rau củ quả, lá cây, thức ăn thừa. Thùng xanh lá (green).
- 2. "recyclable" (Rác tái chế) -> 2 ĐIỂM: Chai nhựa sạch rỗng, vỏ lon nhôm/sắt, giấy sách sạch, bìa carton khô. Thùng vàng (yellow).
- 3. "inorganic" (Rác vô cơ) -> 3 ĐIỂM: Rác không thể tái chế thông thường, túi nilon, màng bọc bẩn, hộp xốp, tã bỉm. Thùng cam (orange).
Nếu chai/ly còn nước: hasLiquid = true, requiresRescanEmpty = true, points = 0.
${hint ? `Gợi ý nhận diện: ${hint}` : ''}`;

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
    ];

    let response: any = null;
    let lastErr: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isWaste: { type: Type.BOOLEAN },
                category: { type: Type.STRING },
                itemName: { type: Type.STRING },
                points: { type: Type.INTEGER },
                confidence: { type: Type.NUMBER },
                hasLiquid: { type: Type.BOOLEAN },
                liquidStateDescription: { type: Type.STRING },
                requiresRescanEmpty: { type: Type.BOOLEAN },
                verificationPassed: { type: Type.BOOLEAN },
                rescanVerified: { type: Type.BOOLEAN },
                verificationMessage: { type: Type.STRING },
                isUncertain: { type: Type.BOOLEAN },
                uncertaintyReason: { type: Type.STRING },
                preparationSteps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      instruction: { type: Type.STRING },
                      reason: { type: Type.STRING },
                      isSafetyWarning: { type: Type.BOOLEAN },
                    },
                    required: ['id', 'instruction'],
                  },
                },
                specialHandlingNotice: { type: Type.STRING },
                isHazardousOrSpecial: { type: Type.BOOLEAN },
                localRuleNote: { type: Type.STRING },
                description: { type: Type.STRING },
                binColor: { type: Type.STRING },
                recyclingTip: { type: Type.STRING },
                ecoImpact: { type: Type.STRING },
                rejectionReason: { type: Type.STRING },
              },
              required: ['isWaste', 'category', 'itemName', 'points', 'confidence', 'description', 'binColor', 'recyclingTip'],
            },
            temperature: 0.1,
          },
        });
        if (response && response.text) {
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (!response || !response.text) {
      throw lastErr || new Error('Không thể phân tích ảnh bằng AI');
    }

    const parsed = JSON.parse(response.text.trim());
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    return res.status(200).json({
      success: true,
      data: {
        ...parsed,
        scanId,
        flowState: 'ai_recognized',
      },
      quota: {
        limit: 30,
        used: 1,
        remaining: 29,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Lỗi xử lý phân loại rác',
    });
  }
}

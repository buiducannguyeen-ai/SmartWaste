import { GoogleGenAI, Type } from "@google/genai";

export interface ModerationResult {
  approved: boolean;
  imageCheckPassed: boolean;
  textCheckPassed: boolean;
  isAIGenerated?: boolean;
  aiAuthenticityPassed?: boolean;
  rejectionReason?: string;
  wasteTypeDetected: string;
  severityLevel: 'low' | 'medium' | 'high' | 'urgent';
  summary?: string;
  moderatedBy: string;
}

// Common Vietnamese profanity, insult, and inappropriate words / patterns
const INAPPROPRIATE_KEYWORDS = [
  // Profanity & Vulgarities
  'đm', 'đmm', 'dmm', 'vcl', 'clgt', 'vkl', 'địt', 'dit', 'lồn', 'lon', 'buồi', 'buoi',
  'cặc', 'cac', 'chó đẻ', 'khốn nạn', 'đĩ', 'mẹ kiếp', 'bà mẹ', 'óc chó', 'thằng ngu',
  'con điên', 'đồ ngu', 'mất dạy', 'thất đức', 'đụ', 'đụ má', 'bitch', 'fuck', 'shit',
  'asshole', 'bastard', 'ngu lol', 'ngu vl', 'chet tiệt', 'chết tiệt',
  // Slander, offensive attacks, harassment
  'đồ rác rưởi người', 'giết', 'chém', 'đánh chết', 'lừa đảo',
];

// Keywords indicating legitimate waste reporting context
const WASTE_CONTEXT_KEYWORDS = [
  'rác', 'bãi rác', 'xà bần', 'túi nilon', 'nilông', 'nhựa', 'chai', 'hôi', 'bốc mùi',
  'ùn ứ', 'tồn đọng', 'ô nhiễm', 'vứt rác', 'chất thải', 'thùng rác', 'nước thải',
  'cống', 'mương', 'kênh', 'phế thải', 'lá cây', 'thức ăn thừa', 'bừa bãi', 'tràn',
  'dọn', 'thu gom', 'môi trường', 'vỉa hè', 'lòng đường', 'cỏ rác', 'dơ', 'bẩn',
];

/**
 * Text rule-based filter check
 */
export function checkTextRules(text: string, location: string): { passed: boolean; reason?: string } {
  const combined = (text + ' ' + location).toLowerCase();
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  // 1. Word count check: MUST be at least 15 words to avoid spam/junk posts
  if (words.length < 15) {
    return {
      passed: false,
      reason: `Nội dung mô tả quá ngắn (${words.length}/15 từ). Quy định cộng đồng yêu cầu bài phản ánh phải có trên 15 từ để tránh bài đăng rác/spam. Vui lòng mô tả chi tiết hơn về loại rác, phạm vi ô nhiễm và thời gian tồn đọng.`,
    };
  }

  // 2. Gibberish / spam check (repeated characters like "aaaaaaa", "asdfasdf")
  if (/(.)\1{5,}/.test(trimmed)) {
    return {
      passed: false,
      reason: 'Nội dung phản ánh chứa chuỗi ký tự lặp lại bất thường (dấu hiệu spam). Vui lòng viết mô tả rõ ràng bằng tiếng Việt có nghĩa.',
    };
  }

  // 3. Profanity / Inappropriate words check
  for (const word of INAPPROPRIATE_KEYWORDS) {
    const regex = new RegExp(`(^|[\\s.,!?_\\-])${word}([\\s.,!?_\\-]|$)`, 'i');
    if (regex.test(combined)) {
      return {
        passed: false,
        reason: `Nội dung chứa từ ngữ không phù hợp hoặc vi phạm chuẩn mực văn minh ("${word}"). Vui lòng chỉnh sửa lại lời lẽ lịch sự, tôn trọng cộng đồng.`,
      };
    }
  }

  return { passed: true };
}

// Check for blank or pure black image data
export function isImageBlankOrBlack(base64: string): boolean {
  if (!base64 || base64.trim().length < 150) return true;
  // A solid black or uninitialized video capture has long runs of AAAA (0x00 bytes)
  const longZeroRuns = base64.match(/A{30,}/g);
  if (longZeroRuns) {
    const totalZeroChars = longZeroRuns.reduce((sum, run) => sum + run.length, 0);
    if (totalZeroChars > 150 || totalZeroChars > base64.length * 0.25) {
      return true;
    }
  }
  return false;
}

/**
 * Moderate waste report using Gemini AI (with smart heuristic fallback)
 */
export async function moderateWasteReport(
  ai: GoogleGenAI | null,
  params: {
    image: string; // Base64 or URL
    description: string;
    location: string;
  }
): Promise<ModerationResult> {
  const { image, description, location } = params;

  // 1. Initial local rule check for text
  const textRule = checkTextRules(description, location);
  if (!textRule.passed) {
    return {
      approved: false,
      imageCheckPassed: false,
      textCheckPassed: false,
      rejectionReason: textRule.reason,
      wasteTypeDetected: 'Không xác định',
      severityLevel: 'low',
      moderatedBy: 'EcoSort Text Moderation Engine',
    };
  }

  // 2. Prepare image data
  let base64Data = image;
  let mimeType = 'image/jpeg';
  if (image.includes(',')) {
    const parts = image.split(',');
    base64Data = parts[1];
    const match = parts[0].match(/data:(.*?);base64/);
    if (match) {
      mimeType = match[1];
    }
  } else if (image.startsWith('http://') || image.startsWith('https://')) {
    try {
      const resp = await fetch(image);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        base64Data = Buffer.from(buf).toString('base64');
        const cType = resp.headers.get('content-type');
        if (cType) mimeType = cType;
      }
    } catch (fetchErr) {
      console.warn('Notice fetching external image for AI moderation:', fetchErr);
    }
  }

  // Check if image is blank, uninitialized, or pure pitch black
  if (isImageBlankOrBlack(base64Data)) {
    return {
      approved: false,
      imageCheckPassed: false,
      textCheckPassed: true,
      rejectionReason:
        'Hình ảnh tải lên bị tối đen hoàn toàn hoặc camera chưa bắt được hình ảnh. Vui lòng kiểm tra lại camera hoặc tải lên ảnh chụp rõ nét về tình trạng rác thải.',
      wasteTypeDetected: 'Ảnh tối đen / Ống kính bị che',
      severityLevel: 'low',
      moderatedBy: 'EcoSort Vision Guard',
    };
  }

  // 3. If Gemini is available, use Gemini 3.8 Flash for Multimodal Verification
  if (ai && base64Data && base64Data.length > 50) {
    try {
      const prompt = `Bạn là Chuyên viên Kiểm duyệt Cấp cao & Hệ thống Chống Tin Giả Mạo Thông Minh (AI Authenticity & Fact-Checker Moderator) cho Nền tảng Phản ánh Rác thải & Bảo vệ Môi trường Đô thị.
Nhiệm vụ của bạn là kiểm duyệt khắt khe và công tâm bài đăng phản ánh của người dân theo 3 TIÊU CHÍ BẮT BUỘC:

1. KIỂM TRA TÍNH XÁC THỰC QUANG HỌC & PHÁT HIỆN ẢNH DO AI TẠO RA (isAIGenerated & aiAuthenticityPassed):
- MỤC TIÊU: Ngăn chặn triệt để việc dùng ảnh do AI tạo ra (Midjourney, DALL-E, Stable Diffusion, Flux, Leonardo, Sora, Photoshop Generative Fill, Deepfakes, CGI render) để tung tin đồn thất thiệt, vu khống địa phương hoặc spam/gian lận điểm thưởng.
- DẤU HIỆU CỦA ẢNH DO AI TẠO RA HOẶC ẢNH GIẢ MẠO CẦN PHÁT HIỆN:
  + Độ mịn màng hoặc bóng sáp phi tự nhiên (waxy/plastic texture) trên mặt túi rác, cây cỏ, bê tông.
  + Các nét chữ, con số trên bao bì, biển hiệu, nhãn chai bị méo mó, nguệch ngoạc không đọc được (ký tự vô nghĩa đặc trưng của AI hallucination).
  + Ánh sáng, đổ bóng, phản chiếu mang tính nghệ thuật điện ảnh hư cấu (cinematic rendering), góc máy hoặc phông nền hòa tan phi lý không giống ảnh quang học chụp từ camera smartphone.
  + Cắt ghép vật thể rác giả mạo vào một bức ảnh đường phố sạch nhằm vu khống.
  + Tranh minh họa, 3D CGI, tranh hoạt hình, đồ họa vector số.
- QUY TẮC PHÊ DUYỆT / TỪ CHỐI ẢNH AI:
  + Nếu ảnh CÓ BẤT KỲ DẤU HIỆU NÀO CỦA ẢNH AI TẠO RA HOẶC GIẢ MẠO:
    -> BẮT BUỘC: isAIGenerated = true, aiAuthenticityPassed = false, imageCheckPassed = false, approved = false!
    -> BẮT BUỘC ghi rõ trong rejectionReason: "Hệ thống phát hiện hình ảnh có dấu hiệu được tạo bởi AI hoặc giả mạo kỹ thuật số (AI-Generated / Synthetic Fake). Để đảm bảo tính trung thực và ngăn ngừa tin giả, hệ thống chỉ chấp nhận ảnh chụp quang học thực tế từ camera của bạn."
  + Nếu là ảnh chụp quang học thực tế từ camera ngoài đời: isAIGenerated = false, aiAuthenticityPassed = true.

2. KIỂM DUYỆT NỘI DUNG HÌNH ẢNH RÁC THẢI (imageCheckPassed):
- YÊU CẦU: Hình ảnh PHẢI là ảnh chụp thực tế có sự xuất hiện rõ ràng của tình trạng rác thải, ô nhiễm môi trường, bãi rác tự phát, đống rác sinh hoạt, phế thải xây dựng, rác kênh rạch, thùng rác quá tải tràn ra đường, hoặc rác bừa bãi nơi công cộng.
- BẮT BUỘC TỪ CHỐI (imageCheckPassed = false) nếu ảnh thuộc các trường hợp sau:
  + Ảnh chân dung người, selfie cá nhân, trẻ em, người mẫu.
  + Ảnh thú cưng (chó, mèo...), động vật, vườn tược cây cối sạch sẽ không có rác.
  + Ảnh đồ ăn ngon, bữa ăn gia đình, thức ăn bày trên đĩa sạch trong nhà hàng.
  + Ảnh xe cộ, xe máy, ôtô, đường phố phong cảnh sạch sẽ tinh tươm không có rác thải.
  + Ảnh chụp màn hình ứng dụng khác, văn bản giấy tờ tài liệu, hoạt hình, meme, tranh vẽ.

3. KIỂM DUYỆT NỘI DUNG VĂN BẢN (textCheckPassed):
- Mô tả của người dân: "${description}"
- Địa điểm/Khu vực: "${location}"
- BẮT BUỘC TỪ CHỐI (textCheckPassed = false) nếu:
  + Nội dung dưới 15 từ, hoặc mang tính chất spam, gõ chữ vô nghĩa (ví dụ: "test 123", "aaaaa"), không có nội dung mô tả sự việc chi tiết.
  + Chứa từ ngữ thô tục, chửi thề, lăng mạ, vu khống, xúc phạm danh dự người khác hoặc tổ chức.
  + Nội dung quảng cáo bán hàng, cá độ, nội dung kích động vi phạm pháp luật.

QUY TẮC PHÊ DUYỆT (approved):
- approved = true KHI VÀ CHỈ KHI:
  + isAIGenerated == false (Không phải ảnh AI tạo ra)
  + aiAuthenticityPassed == true (Đã xác thực ảnh chụp thực tế)
  + imageCheckPassed == true (Có tình trạng rác thải rõ ràng)
  + textCheckPassed == true (Văn minh, chi tiết trên 15 từ)
- Nếu approved = false: BẮT BUỘC phải điền "rejectionReason" bằng tiếng Việt thật chi tiết, nêu rõ lý do (Ví dụ: do ảnh AI giả mạo, ảnh không có rác, hay nội dung chưa đủ 15 từ/spam).

Hãy phản hồi kết quả dưới dạng JSON theo đúng schema.`;

      // Priority ordered models: lightweight high-capacity first to avoid 503 high demand spikes
      const candidateModels = [
        'gemini-3.1-flash-lite',
        'gemini-3.6-flash',
        'gemini-3.8-flash',
        'gemini-flash-latest',
      ];
      let response: any = null;
      let lastErr: any = null;

      for (const modelName of candidateModels) {
        try {
          const generatePromise = ai.models.generateContent({
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
                  approved: {
                    type: Type.BOOLEAN,
                    description: 'True nếu bài đăng hợp lệ cả về ảnh rác thật lẫn nội dung văn minh trên 15 từ',
                  },
                  imageCheckPassed: {
                    type: Type.BOOLEAN,
                    description: 'True nếu ảnh thực sự chụp rác thải hoặc ô nhiễm',
                  },
                  textCheckPassed: {
                    type: Type.BOOLEAN,
                    description: 'True nếu nội dung văn minh, chi tiết trên 15 từ và không spam',
                  },
                  isAIGenerated: {
                    type: Type.BOOLEAN,
                    description: 'True nếu phát hiện ảnh do AI tạo ra (Midjourney, DALL-E, Stable Diffusion, CGI, 3D render, ghép giả)',
                  },
                  aiAuthenticityPassed: {
                    type: Type.BOOLEAN,
                    description: 'True nếu là ảnh chụp quang học thực tế ngoài đời thực',
                  },
                  rejectionReason: {
                    type: Type.STRING,
                    description: 'Lý do cụ thể từ chối nếu không đạt (tiếng Việt)',
                  },
                  wasteTypeDetected: {
                    type: Type.STRING,
                    description: 'Loại rác nhận diện được trong ảnh (tiếng Việt)',
                  },
                  severityLevel: {
                    type: Type.STRING,
                    description: 'Mức độ nghiêm trọng: low, medium, high, hoặc urgent',
                  },
                  summary: {
                    type: Type.STRING,
                    description: 'Tóm tắt ngắn gọn tình trạng (1 câu tiếng Việt)',
                  },
                },
                required: ['approved', 'imageCheckPassed', 'textCheckPassed', 'isAIGenerated'],
              },
            },
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini Moderation timeout after 10s on ${modelName}`)), 10000)
          );

          response = await Promise.race([generatePromise, timeoutPromise]);
          if (response?.text) {
            break;
          }
        } catch (modelErr: any) {
          lastErr = modelErr;
          console.warn(`Gemini Moderation ${modelName} failed (${modelErr?.message}), trying next candidate...`);
          const isTransient = String(modelErr?.message || '').includes('503') || String(modelErr?.message || '').includes('429');
          if (isTransient) {
            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }

      if (!response) {
        throw lastErr || new Error('All Gemini moderation models failed');
      }

      let rawText = (response.text || '{}').trim();
      if (rawText.startsWith('```json')) {
        rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      let parsed: any = {};
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        console.warn('Failed to parse Gemini response JSON, raw text was:', rawText.slice(0, 100));
        parsed = {};
      }

      const isAIGenerated = Boolean(parsed.isAIGenerated);
      const aiAuthenticityPassed = parsed.aiAuthenticityPassed !== undefined ? Boolean(parsed.aiAuthenticityPassed) : !isAIGenerated;
      const imageCheckPassed = Boolean(parsed.imageCheckPassed) && !isAIGenerated && aiAuthenticityPassed;
      const textCheckPassed = Boolean(parsed.textCheckPassed);
      const approved = Boolean(parsed.approved && imageCheckPassed && textCheckPassed);

      let rejectionReason = parsed.rejectionReason;
      if (!approved && !rejectionReason) {
        if (isAIGenerated || !aiAuthenticityPassed) {
          rejectionReason = 'Hệ thống AI phát hiện hình ảnh có dấu hiệu được tạo bằng AI hoặc cắt ghép kỹ thuật số (AI-Generated Image). Vui lòng chụp ảnh thực tế ngoài đời để phản ánh.';
        } else if (!imageCheckPassed) {
          rejectionReason = 'Hình ảnh tải lên không liên quan đến rác thải hoặc ô nhiễm môi trường (phát hiện đối tượng khác hoặc không có rác). Vui lòng tải lên ảnh chụp thực tế bãi rác hoặc thùng rác cần xử lý.';
        } else if (!textCheckPassed) {
          rejectionReason = 'Nội dung mô tả không đạt yêu cầu (cần trên 15 từ mô tả chi tiết, không chứa từ ngữ thô tục hoặc spam).';
        } else {
          rejectionReason = 'Bài phản ánh không đáp ứng tiêu chuẩn kiểm duyệt cộng đồng.';
        }
      }

      return {
        approved,
        imageCheckPassed,
        textCheckPassed,
        isAIGenerated,
        aiAuthenticityPassed,
        rejectionReason: approved ? undefined : rejectionReason,
        wasteTypeDetected: parsed.wasteTypeDetected || 'Rác thải sinh hoạt đô thị',
        severityLevel: (['low', 'medium', 'high', 'urgent'].includes(parsed.severityLevel) ? parsed.severityLevel : 'medium') as any,
        summary: parsed.summary || description.slice(0, 100),
        moderatedBy: 'Gemini 3.8 Flash Vision AI (Chống Tin Giả & Ảnh AI)',
      };
    } catch (err: any) {
      console.error('Gemini moderation call failed, strictly rejecting uninspected image:', err?.message);
      // STRICT ANTI-CHEATING & SAFETY: When AI vision errors or fails, NEVER approve based on text alone!
      return {
        approved: false,
        imageCheckPassed: false,
        textCheckPassed: true,
        isAIGenerated: false,
        aiAuthenticityPassed: false,
        rejectionReason:
          'Hệ thống AI thị giác gặp sự cố hoặc thời gian phản hồi quá lâu trong khi kiểm tra hình ảnh. Để bảo vệ không gian cộng đồng khỏi tin giả và ảnh không liên quan, bài phản ánh KHÔNG THỂ phê duyệt chỉ dựa vào nội dung chữ khi hình ảnh chưa được AI xác minh. Vui lòng thử gửi lại bài sau giây lát.',
        wasteTypeDetected: 'Chưa xác thực hình ảnh',
        severityLevel: 'low',
        moderatedBy: 'EcoSort Vision Guard (Lỗi kết nối AI thị giác)',
      };
    }
  }

  // 4. If AI is not available (e.g. missing API key or invalid image):
  // STRICT RULE: Never approve a report when image was not verified by AI!
  return {
    approved: false,
    imageCheckPassed: false,
    textCheckPassed: true,
    isAIGenerated: false,
    aiAuthenticityPassed: false,
    rejectionReason:
      'Hệ thống kiểm duyệt hình ảnh AI chưa sẵn sàng (thiếu GEMINI_API_KEY hoặc ảnh không hợp lệ). Vì lý do an toàn cộng đồng, bài phản ánh không thể tự động phê duyệt nếu hình ảnh chưa được AI kiểm tra.',
    wasteTypeDetected: 'Chưa kiểm tra ảnh',
    severityLevel: 'low',
    moderatedBy: 'EcoSort Vision Guard (Chưa kiểm tra)',
  };
}

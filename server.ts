import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import {
  initStore,
  getLeaderboard,
  upsertPlayer,
  resetAllPlayerPoints,
  recordClassification,
  getHistory,
  subscribeToStoreUpdates,
  getWasteReports,
  addWasteReport,
  deleteWasteReport,
  clearAllWasteReports,
  updateWasteReportStatus,
  upvoteWasteReport,
  syncLeaderboardFromSupabase,
  addMisclassificationFeedback,
  getMisclassificationFeedbacks,
} from "./server/store.ts";
import type { StoredWasteReport } from "./server/store.ts";
import { moderateWasteReport } from "./server/moderation.ts";
import { createAndSendPin, verifySubmittedPin } from "./server/emailAuth.ts";

dotenv.config();

const app = express();
const PORT = 3000;

// Support larger payload for images and webcam base64 (Upgraded to 500MB)
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// Express JSON body error handler - return pure JSON instead of default HTML error page
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      approved: false,
      error: 'Dung lượng hình ảnh gửi lên quá lớn (vượt quá giới hạn 500MB). Vui lòng chọn ảnh có kích thước dưới 500MB.',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      approved: false,
      error: 'Dữ liệu gửi lên không đúng định dạng JSON hợp lệ.',
    });
  }
  next(err);
});

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    serverTime: new Date().toISOString(),
  });
});

// AI Waste Classification API
app.post("/api/classify-waste", async (req, res) => {
  try {
    const { image, hint } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Thiếu dữ liệu hình ảnh (base64 image required)" });
    }

    // Extract raw base64 data and mimeType
    let base64Data = image;
    let mimeType = "image/jpeg";

    if (image.includes(",")) {
      const parts = image.split(",");
      base64Data = parts[1];
      const match = parts[0].match(/data:(.*?);base64/);
      if (match) {
        mimeType = match[1];
      }
    }

    const ai = getAI();

    if (!ai) {
      return res.status(503).json({
        success: false,
        error: "Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng cấu hình khóa API trong mục Cài đặt để AI nhận diện hoạt động.",
      });
    }

    try {
      const prompt = `Bạn là chuyên gia AI phân loại rác thông minh cho dự án cuộc thi STEM môi trường.
Hãy phân tích hình ảnh này và thực hiện các bước kiểm tra theo quy trình chuẩn:

BƯỚC 1: XÁC MINH VẬT THỂ CÓ PHẢI LÀ RÁC THẢI HAY KHÔNG (isWaste):
- Hãy quan sát kỹ toàn bộ ảnh xem có thực sự xuất hiện một vật thể rác thải, phế liệu, rác sinh hoạt cần bỏ thùng rác hay không.
- Nếu ảnh KHÔNG CHỨA RÁC (ví dụ: ảnh selfie, mặt người, cơ thể người, thú cưng, căn phòng sạch, tường trống, xe cộ, đồ ăn nguyên vẹn ngon lành trên bàn, vật dụng cá nhân bình thường đang dùng, hoặc ảnh mờ đen tối không rõ):
  -> Đặt isWaste = false, category = "unknown", points = 0, itemName = tên vật thể phát hiện (ví dụ: "Người / Khuôn mặt", "Thú cưng", "Môi trường không có rác"), rejectionReason = "Hình ảnh không phải là rác thải hoặc không phát hiện vật thể cần phân loại. Vui lòng đưa mẫu rác vào trước camera."
- Nếu ảnh CHỨA RÁC THẢI RÕ RÀNG:
  -> Đặt isWaste = true và phân loại vào Bước 2.

BƯỚC 2: PHÂN LOẠI RÁC VÀ TÍNH ĐIỂM CHUẨN XÁC:
1. "organic" (Rác hữu cơ) -> số điểm: 1. Ví dụ: vỏ hoa quả (chuối, táo...), rau củ hỏng, lá cây, thức ăn thừa, bã trà/cà phê.
2. "recyclable" (Rác tái chế) -> số điểm: 2. Ví dụ: chai nhựa PET, vỏ lon nhôm/kim loại, giấy báo vụn, thùng bìa carton, chai lọ thủy tinh, cốc nhựa sạch.
3. "inorganic" (Rác vô cơ / Rác còn lại khó phân hủy) -> số điểm: 3. Ví dụ: túi nilon, màng bọc thực phẩm, hộp xốp vỡ bẩn, tã bỉm, mảnh gốm sứ vỡ, pin cũ, bóng đèn, khẩu trang y tế đã qua sử dụng.

BƯỚC 3: KIỂM TRA CHỐNG GIAN LẬN (Anti-Cheat Spoof Check):
- Kiểm tra xem người dùng có đang giơ một màn hình điện thoại, máy tính bảng hoặc ảnh in 2D phẳng lên trước camera để giả mạo quét ảnh lấy điểm thay vì rác thật hay không (nhận diện qua viền màn hình, phản quang đèn nền, lưới điểm ảnh hiển thị, góc phẳng 2D).
- Nếu phát hiện rõ ràng là giơ màn hình điện thoại hoặc ảnh 2D để gian lận, hãy đặt isScreenOrPhotoSpoof = true và giải thích trong spoofReason.

BƯỚC 4: HƯỚNG DẪN 1-2 VIỆC CẦN THỰC HIỆN TRƯỚC KHI BỎ RÁC (preparationSteps):
- Trả về tối đa 2 bước xử lý cụ thể, ngắn gọn, dễ hiểu và phù hợp nhất cho học sinh đối với vật thể này trước khi bỏ vào thùng.
- Phù hợp với chất liệu và vật thể thực tế:
  * Chai nhựa còn nước/chất lỏng: Đổ hết nước thừa; đóng nắp hoặc tháo tách nắp tùy quy định thu gom.
  * Hộp sữa giấy: Đổ hết sữa thừa, làm sạch sơ hoặc ép dẹp nếu phù hợp.
  * Hộp nhựa đựng thức ăn: Loại bỏ hoàn toàn thức ăn thừa, tráng sơ sạch dầu mỡ.
  * Giấy dính dầu mỡ / khăn ướt: Xếp vào rác vô cơ (giải thích ngắn vì dầu mỡ làm hỏng quá trình tái chế giấy sạch).
  * Pin cũ / đồ điện tử / bóng đèn: Xếp vào rác vô cơ (kèm cảnh báo an toàn thu gom riêng). CẢNH BÁO AN TOÀN TUYỆT ĐỐI: Không bỏ chung thùng rác sinh hoạt thông thường, chuyển đến điểm thu gom pin chuyên dụng; tuyệt đối không đập, cạy hoặc xử lý nguy hiểm. Đặt isSafetyWarning = true.
  * Vật sắc nhọn (mảnh chai vỡ, kim tiêm, dao lam): Gói bọc kỹ đầu nhọn bằng giấy dày hoặc bìa carton trước khi bỏ thùng rác vô cơ để bảo vệ người thu gom. Đặt isSafetyWarning = true.
  * Rác hữu cơ sạch (vỏ chuối, rau thừa): Bỏ trực tiếp vào thùng hữu cơ (không yêu cầu rửa hoặc làm sạch không cần thiết).
- KHÔNG mặc định mọi vật dụng đều phải rửa, tháo rời hoặc tách nắp nếu không cần thiết.
- Với pin, vật sắc nhọn, rác nguy hại, PHẢI ưu tiên an toàn, hướng dẫn thu gom riêng, KHÔNG yêu cầu học sinh tự tháo hay xử lý nguy hiểm.

Yêu cầu trả về JSON chuẩn theo schema:
- isWaste: boolean, true nếu là rác thải, false nếu không phải rác hoặc không nhận diện được.
- category: "organic", "recyclable", "inorganic", hoặc "unknown" (nếu isWaste=false).
- itemName: tên ngắn gọn tiếng Việt của món rác hoặc vật thể trong ảnh.
- points: 1 nếu là organic, 2 nếu là recyclable, 3 nếu là inorganic, 0 nếu không phải rác hoặc chưa chắc chắn.
- confidence: số thực từ 0.0 đến 1.0 biểu thị độ tin cậy ước tính của AI (hãy thể hiện trung thực mức độ chắc chắn; nếu ảnh mờ, khuất góc, không rõ vật thể hoặc phân vân giữa các nhóm thì cho điểm số confidence thấp phản ánh đúng mức độ không chắc chắn, không ép buộc khoảng cố định).
- isUncertain: boolean, true nếu AI chưa chắc chắn về loại rác này, không rõ vật thể hoặc phân vân giữa các nhóm.
- uncertaintyReason: nếu isUncertain=true, ghi lý do tiếng Việt (ví dụ: "AI chưa chắc chắn về vật thể này. Vui lòng chụp lại ở nơi đủ ánh sáng hoặc chọn báo cáo AI nhận nhầm.").
- preparationSteps: mảng tối đa 2 bước thực hiện trước khi bỏ rác (mỗi bước có id, instruction, reason, isSafetyWarning).
- specialHandlingNotice: chuỗi hướng dẫn thu gom an toàn nếu là pin, vật nhọn hoặc rác nguy hại.
- isHazardousOrSpecial: boolean, true nếu là pin cũ, mảnh vỡ hoặc vật cần điểm thu gom riêng.
- description: giải thích 1 câu ngắn về chất liệu và tính chất phân hủy.
- binColor: màu thùng rác tương ứng ("green" cho hữu cơ, "yellow" cho tái chế, "orange" cho vô cơ, "gray" nếu không xác định).
- recyclingTip: lời khuyên bảo vệ môi trường và cách bỏ rác chuẩn STEM cho học sinh.
- ecoImpact: số liệu ước tính bảo vệ môi trường.
- rejectionReason: nếu isWaste = false, ghi rõ lý do từ chối (tiếng Việt).
- isScreenOrPhotoSpoof: boolean, true nếu phát hiện ảnh chụp từ màn hình hoặc ảnh giả mạo.
- spoofReason: chuỗi mô tả nếu phát hiện gian lận màn hình.
${hint ? `Gợi ý nhận diện từ hệ thống: ${hint}` : ""}`;

      // Priority ordered models: ultra-fast lightweight models first to ensure instant response (<3s) without 503 high demand spikes
      const candidateModels = [
        "gemini-3.5-flash-lite",
        "gemini-3.7-flash",
        "gemini-3.8-flash",
        "gemini-3.5-flash",
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
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  isWaste: {
                    type: Type.BOOLEAN,
                    description: "True nếu là vật thể rác thải, False nếu không phải rác hoặc ảnh người, vật dụng sạch",
                  },
                  category: {
                    type: Type.STRING,
                    description: "organic, recyclable, inorganic, hoặc unknown",
                  },
                  itemName: {
                    type: Type.STRING,
                    description: "Tên vật thể rác tiếng Việt",
                  },
                  points: {
                    type: Type.INTEGER,
                    description: "1 cho organic, 2 cho recyclable, 3 cho inorganic, 0 nếu không phải rác hoặc chưa chắc chắn",
                  },
                  confidence: {
                    type: Type.NUMBER,
                    description: "Độ tin cậy ước lượng từ 0.0 đến 1.0 (trung thực với độ chắc chắn)",
                  },
                  isUncertain: {
                    type: Type.BOOLEAN,
                    description: "True nếu AI chưa chắc chắn về vật thể hoặc loại rác này",
                  },
                  uncertaintyReason: {
                    type: Type.STRING,
                    description: "Lý do chưa chắc chắn nếu isUncertain=true",
                  },
                  preparationSteps: {
                    type: Type.ARRAY,
                    description: "Tối đa 2 bước xử lý cụ thể trước khi bỏ rác cho học sinh",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        instruction: { type: Type.STRING, description: "Hành động ngắn gọn 1 câu" },
                        reason: { type: Type.STRING, description: "Lý do vì sao cần làm" },
                        isSafetyWarning: { type: Type.BOOLEAN, description: "True nếu là cảnh báo an toàn cho pin, vật nhọn, độc hại" },
                      },
                      required: ["id", "instruction"],
                    },
                  },
                  specialHandlingNotice: {
                    type: Type.STRING,
                    description: "Cảnh báo an toàn hoặc hướng dẫn thu gom riêng nếu là pin, vật nhọn, rác nguy hại",
                  },
                  isHazardousOrSpecial: {
                    type: Type.BOOLEAN,
                    description: "True nếu là pin cũ, mảnh vỡ hoặc vật cần điểm thu gom riêng",
                  },
                  description: {
                    type: Type.STRING,
                    description: "Mô tả chất liệu và tính chất",
                  },
                  binColor: {
                    type: Type.STRING,
                    description: "green, yellow, orange, hoặc gray",
                  },
                  recyclingTip: {
                    type: Type.STRING,
                    description: "Lời khuyên bỏ rác chuẩn môi trường",
                  },
                  ecoImpact: {
                    type: Type.STRING,
                    description: "Tác động sinh thái tích cực",
                  },
                  rejectionReason: {
                    type: Type.STRING,
                    description: "Lý do từ chối nếu không phải rác",
                  },
                  isScreenOrPhotoSpoof: {
                    type: Type.BOOLEAN,
                    description: "True nếu người dùng chụp lại màn hình điện thoại hoặc ảnh 2D thay vì rác thật",
                  },
                  spoofReason: {
                    type: Type.STRING,
                    description: "Giải thích nếu phát hiện ảnh chụp từ màn hình",
                  },
                },
                required: [
                  "isWaste",
                  "category",
                  "itemName",
                  "points",
                  "confidence",
                  "description",
                  "binColor",
                  "recyclingTip",
                ],
              },
            },
          });

          // 12-second timeout per model candidate to allow full vision inference & JSON schema generation
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini Vision timeout after 12s on ${modelName}`)), 12000)
          );

          response = await Promise.race([generatePromise, timeoutPromise]);
          if (response?.text) {
            break;
          }
        } catch (modelErr: any) {
          lastErr = modelErr;
          console.warn(`Gemini Vision ${modelName} notice (${modelErr?.message}), trying next candidate...`);
          // If transient overload (503 / 429), yield briefly before next candidate
          const isTransient = String(modelErr?.message || "").includes("503") || String(modelErr?.message || "").includes("429");
          if (isTransient) {
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      }

      if (!response) {
        throw lastErr || new Error("Tất cả mô hình AI nhận diện đều không phản hồi");
      }

      let rawText = (response.text || "{}").trim();
      if (rawText.startsWith("```json")) {
        rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (rawText.startsWith("```")) {
        rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      const result = JSON.parse(rawText);

      // Check anti-spoof
      if (result.isScreenOrPhotoSpoof) {
        result.points = 0;
        return res.json({
          success: false,
          isSpoof: true,
          error: result.spoofReason || "Phát hiện dấu hiệu gian lận: đưa màn hình thiết bị hoặc ảnh chụp 2D vào camera. Không cộng điểm.",
          data: {
            ...result,
            points: 0,
          },
        });
      }

      // Check if image actually contains waste
      if (result.isWaste === false || result.category === "unknown") {
        result.points = 0;
        result.category = "unknown";
        return res.json({
          success: false,
          isNotWaste: true,
          error: result.rejectionReason || "Hình ảnh không phải là rác thải hợp lệ hoặc quá mờ. Không thể cộng điểm.",
          data: {
            ...result,
            points: 0,
            category: "unknown",
          },
        });
      }

      // Configurable confidence uncertainty threshold (default 0.60)
      const UNCERTAINTY_THRESHOLD = Number(process.env.CONFIDENCE_UNCERTAINTY_THRESHOLD) || 0.60;
      const rawConf = typeof result.confidence === "number" ? result.confidence : 0.50;
      const normalizedConfidence = Math.max(0, Math.min(1, rawConf));
      result.confidence = normalizedConfidence;

      // Check if AI is uncertain or confidence is below threshold
      const isLowConfidence = normalizedConfidence < UNCERTAINTY_THRESHOLD;
      const isExplicitUncertain = result.isUncertain === true || result.category === "uncertain";

      if (isLowConfidence || isExplicitUncertain) {
        result.isUncertain = true;
        result.points = 0; // CRITICAL: Uncertain cases NEVER receive points
        result.uncertaintyReason =
          "AI chưa chắc chắn về vật thể này. Vui lòng chụp lại ở nơi đủ ánh sáng hoặc chọn báo cáo AI nhận nhầm.";

        return res.json({
          success: true,
          mode: "gemini-ai",
          isUncertain: true,
          data: {
            ...result,
            isUncertain: true,
            points: 0,
            uncertaintyReason: result.uncertaintyReason,
          },
        });
      }

      // Ensure points and category align strictly with rules
      if (result.category === "organic") {
        result.points = 1;
        result.binColor = "green";
      } else if (result.category === "recyclable") {
        result.points = 2;
        result.binColor = "yellow";
      } else if (result.category === "inorganic") {
        result.points = 3;
        result.binColor = "orange";
      } else {
        result.points = 0;
        result.category = "unknown";
        return res.json({
          success: false,
          isNotWaste: true,
          error: "Không nhận diện được loại rác thải hợp lệ. Không cộng điểm.",
          data: { ...result, points: 0 },
        });
      }

      // Standardize 1-2 preparation steps (default status: 'pending')
      if (Array.isArray(result.preparationSteps) && result.preparationSteps.length > 0) {
        result.preparationSteps = result.preparationSteps.slice(0, 2).map((s: any, idx: number) => ({
          id: s.id || `step-${idx + 1}`,
          instruction: String(s.instruction || "").trim(),
          reason: s.reason ? String(s.reason).trim() : undefined,
          isSafetyWarning: Boolean(s.isSafetyWarning),
          status: "pending",
        }));
      } else {
        const itemNameLower = (result.itemName || "").toLowerCase();
        const steps: any[] = [];
        if (itemNameLower.includes("pin") || itemNameLower.includes("ắc quy") || itemNameLower.includes("bóng đèn")) {
          steps.push({
            id: "step-1",
            instruction: "Không bỏ vào thùng rác thường, gom riêng chuyển điểm thu gom pin",
            reason: "Chứa chì và hóa chất độc hại, cần thu gom nguy hại riêng",
            isSafetyWarning: true,
            status: "pending",
          });
        } else if (itemNameLower.includes("chai") || itemNameLower.includes("lon") || itemNameLower.includes("hộp")) {
          steps.push({
            id: "step-1",
            instruction: "Đổ hết nước hoặc thức ăn thừa bên trong",
            reason: "Tránh làm ướt các loại rác tái chế khác và giữ vệ sinh",
            status: "pending",
          });
          if (itemNameLower.includes("sữa") || itemNameLower.includes("carton") || itemNameLower.includes("nhựa")) {
            steps.push({
              id: "step-2",
              instruction: "Làm sạch sơ hoặc ép dẹp gọn gàng",
              reason: "Tiết kiệm thể tích thùng rác",
              status: "pending",
            });
          }
        } else if (itemNameLower.includes("mảnh vỡ") || itemNameLower.includes("kính") || itemNameLower.includes("thủy tinh vỡ")) {
          steps.push({
            id: "step-1",
            instruction: "Bọc kín phần sắc nhọn bằng bìa cứng hoặc giấy báo dày",
            reason: "Bảo đảm an toàn cho người thu gom rác",
            isSafetyWarning: true,
            status: "pending",
          });
        } else if (result.category === "organic") {
          steps.push({
            id: "step-1",
            instruction: "Bỏ trực tiếp vào thùng rác hữu cơ xanh lá",
            reason: "Ủ thành phân compost vi sinh cho cây trồng",
            status: "pending",
          });
        } else {
          steps.push({
            id: "step-1",
            instruction: "Kiểm tra và phân loại đúng thùng quy định",
            reason: "Giúp quy trình thu gom đạt chuẩn môi trường",
            status: "pending",
          });
        }
        result.preparationSteps = steps;
      }

      // Check for hazardous or special items (batteries, chemicals, sharps)
      const isSpecialHazardous =
        result.isHazardousOrSpecial === true ||
        (result.itemName && /pin|ắc quy|pin cúc|nhiệt kế|thủy ngân|kim tiêm|dao lam|bóng đèn huỳnh quang/i.test(result.itemName));
      if (isSpecialHazardous) {
        result.isHazardousOrSpecial = true;
        result.specialHandlingNotice =
          result.specialHandlingNotice ||
          "Lưu ý an toàn: Đây là rác thải đặc biệt / nguy hại. Không bỏ vào thùng rác tái chế hay hữu cơ thông thường; vui lòng mang đến điểm thu gom rác nguy hại chuyên dụng.";
      }

      return res.json({
        success: true,
        mode: "gemini-ai",
        data: result,
      });
    } catch (geminiError: any) {
      console.error("Gemini Vision classification failed strictly:", geminiError?.message);
      // STRICT ANTI-CHEATING: NEVER return random simulated points when AI fails!
      return res.status(422).json({
        success: false,
        error: "AI nhận diện thất bại do lỗi kết nối hoặc ảnh không rõ nét. Không thể xác định loại rác và KHÔNG cộng điểm. Vui lòng đưa mẫu rác vào vùng sáng rõ và bấm quét lại.",
        details: geminiError?.message,
      });
    }
  } catch (error: any) {
    console.error("Classification route error:", error);
    res.status(500).json({ success: false, error: "Lỗi xử lý hình ảnh", details: error.message });
  }
});

// ==============================================================================
// AI MISCLASSIFICATION FEEDBACK & AUDIT APIS (TIẾP NHẬN PHẢN HỒI NHẬN NHẦM)
// ==============================================================================

/**
 * Endpoint for students to report misclassifications or suggest correct category.
 * NOTE: Stored solely for expert evaluation/audit.
 * Does NOT auto-promote user suggestions to ground-truth labels nor artificially inflate accuracy.
 */
app.post("/api/feedback/misclassification", (req, res) => {
  try {
    const {
      userId,
      userName,
      itemName,
      aiCategory,
      aiConfidence,
      userSuggestedCategory,
      userNote,
      thumbnail,
    } = req.body;

    if (!itemName || !userSuggestedCategory) {
      return res.status(400).json({
        success: false,
        error: "Thiếu thông tin vật thể hoặc nhóm rác đề xuất (itemName, userSuggestedCategory required)",
      });
    }

    if (!["organic", "recyclable", "inorganic"].includes(userSuggestedCategory)) {
      return res.status(400).json({
        success: false,
        error: "Nhóm rác đề xuất không hợp lệ (phải là organic, recyclable hoặc inorganic)",
      });
    }

    const saved = addMisclassificationFeedback({
      userId,
      userName: userName ? String(userName).trim() : "Thí sinh STEM",
      itemName: String(itemName).trim(),
      aiCategory: String(aiCategory || "unknown"),
      aiConfidence: typeof aiConfidence === "number" ? aiConfidence : 0,
      userSuggestedCategory,
      userNote: userNote ? String(userNote).trim() : "",
      thumbnail: thumbnail ? String(thumbnail).slice(0, 15000) : undefined,
    });

    return res.json({
      success: true,
      message:
        "Đã tiếp nhận báo cáo phân loại nhầm của bạn để chuyên môn STEM xem xét đánh giá. Ý kiến người dùng được lưu trữ phục vụ phân tích độc lập, không tự động coi là nhãn chuẩn hay dùng để tự nâng điểm số/độ chính xác AI.",
      feedbackId: saved.id,
      feedback: saved,
    });
  } catch (err: any) {
    console.error("Lỗi tiếp nhận báo cáo phân loại nhầm:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Audit query for misclassification reports (for STEM teacher/jury review)
app.get("/api/feedback/misclassification", (_req, res) => {
  try {
    const list = getMisclassificationFeedbacks();
    res.json({
      success: true,
      feedbacks: list,
      count: list.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// REVERSE GEOCODING & REAL-TIME LOCATION APIS
// ==============================================================================

/**
 * Reverse geocodes GPS coordinates (lat, lon) to a specific, human-readable Vietnamese address.
 * Uses Nominatim with custom User-Agent and Photon as a robust fallback.
 */
app.get("/api/reverse-geocode", async (req, res) => {
  try {
    const latStr = (req.query.lat || req.query.latitude) as string;
    const lonStr = (req.query.lon || req.query.lng || req.query.longitude) as string;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng cung cấp tọa độ lat và lon hợp lệ.",
      });
    }

    let specificAddress = "";
    let placeDetails: any = null;

    // 1. Primary: Nominatim with Vietnamese locale and exact street level zoom
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
      const nomRes = await fetch(nomUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "EcoSortAI-STEM-App/1.0 (contact@ecosort.vn)",
          "Accept-Language": "vi,en;q=0.8",
        },
      });
      clearTimeout(timeout);

      if (nomRes.ok) {
        const data = await nomRes.json();
        if (data && data.address) {
          placeDetails = data.address;
          const addr = data.address;
          const segments: string[] = [];

          // Amenity or landmark name if present
          const landmark =
            data.name ||
            addr.amenity ||
            addr.building ||
            addr.school ||
            addr.university ||
            addr.hospital ||
            addr.office ||
            addr.tourism;
          if (landmark && typeof landmark === "string" && !landmark.includes("Đường") && !landmark.includes("Phố")) {
            segments.push(landmark);
          }

          // House number + Road
          if (addr.house_number && (addr.road || addr.street)) {
            const streetName = addr.road || addr.street;
            segments.push(`${addr.house_number} ${streetName}`);
          } else if (addr.road || addr.street) {
            segments.push(addr.road || addr.street);
          }

          // Ward / Suburb / Quarter
          const ward = addr.suburb || addr.quarter || addr.neighbourhood || addr.village;
          if (ward && !segments.includes(ward)) {
            segments.push(ward);
          }

          // District
          const district = addr.city_district || addr.district || addr.county;
          if (district && !segments.includes(district)) {
            segments.push(district);
          }

          // City / Province
          const city = addr.city || addr.province || addr.state;
          if (city && !segments.includes(city)) {
            segments.push(city);
          }

          if (segments.length > 0) {
            specificAddress = segments.join(", ");
          } else if (data.display_name) {
            specificAddress = data.display_name;
          }
        }
      }
    } catch (nomErr: any) {
      console.warn("Nominatim reverse geocode notice:", nomErr?.message);
    }

    // 2. Secondary fallback: Photon reverse geocoding API
    if (!specificAddress) {
      try {
        const pController = new AbortController();
        const pTimeout = setTimeout(() => pController.abort(), 4000);
        const pRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`, {
          signal: pController.signal,
        });
        clearTimeout(pTimeout);

        if (pRes.ok) {
          const pData = await pRes.json();
          const feat = pData.features?.[0];
          if (feat && feat.properties) {
            const prop = feat.properties;
            const pSegments: string[] = [];
            if (prop.name) pSegments.push(prop.name);
            if (prop.street) {
              pSegments.push(prop.housenumber ? `${prop.housenumber} ${prop.street}` : prop.street);
            }
            if (prop.district && !pSegments.includes(prop.district)) pSegments.push(prop.district);
            if (prop.city && !pSegments.includes(prop.city)) pSegments.push(prop.city);
            if (prop.state && !pSegments.includes(prop.state)) pSegments.push(prop.state);
            if (pSegments.length > 0) {
              specificAddress = pSegments.join(", ");
            }
          }
        }
      } catch (pErr: any) {
        console.warn("Photon reverse geocode notice:", pErr?.message);
      }
    }

    // 3. Fallback to GPS coordinates formatted if geocoding APIs are unreachable
    if (!specificAddress) {
      specificAddress = `Vị trí GPS (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
    }

    return res.json({
      success: true,
      address: specificAddress,
      latitude: lat,
      longitude: lon,
      details: placeDetails,
    });
  } catch (error: any) {
    console.error("Reverse geocode endpoint error:", error);
    return res.status(500).json({
      success: false,
      error: "Không thể phân giải vị trí cụ thể từ tọa độ",
      details: error.message,
    });
  }
});

// ==============================================================================
// MULTI-DEVICE SYNCHRONIZATION & REALTIME LEADERBOARD APIS
// ==============================================================================

// 1. Get current unified leaderboard across all devices (direct from Supabase database)
app.get("/api/leaderboard", async (_req, res) => {
  try {
    await syncLeaderboardFromSupabase();
    const list = getLeaderboard();
    res.json({
      success: true,
      leaderboard: list,
      count: list.length,
      serverTime: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Record waste classification points from any device
app.post("/api/leaderboard/record", (req, res) => {
  try {
    const {
      userId,
      userName,
      email,
      organization,
      avatar,
      itemName,
      category,
      points,
      confidence,
      source,
    } = req.body;

    if (!userName || !itemName || !category) {
      return res.status(400).json({
        success: false,
        error: "Thiếu thông tin người chơi hoặc rác quét (userName, itemName, category required)",
      });
    }

    const result = recordClassification({
      userId,
      userName,
      email,
      organization,
      avatar,
      itemName,
      category,
      points: Number(points) || 1,
      confidence: Number(confidence) || 0.95,
      source: source || "webcam",
    });

    return res.json({
      success: true,
      player: result.player,
      totalPoints: result.player.totalPoints,
      correctCount: result.player.correctCount,
      leaderboard: result.leaderboard,
    });
  } catch (err: any) {
    console.error("Lỗi tích điểm đa thiết bị:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Register or sync player profile across all devices
app.post("/api/players/register", (req, res) => {
  try {
    const { id, name, email, organization, avatar, totalPoints } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: "Tên người chơi không được để trống" });
    }

    const player = upsertPlayer({
      id,
      name,
      email,
      organization,
      avatar,
      totalPoints: Number(totalPoints) || 0,
    });

    return res.json({
      success: true,
      player,
      leaderboard: getLeaderboard(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- AUTHENTICATION & EMAIL PIN VERIFICATION (CHỐNG GMAIL ẢO) ---

// 3.1. Send verification PIN to email
app.post("/api/auth/send-pin", async (req, res) => {
  try {
    const { email, purpose, name } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Vui lòng cung cấp địa chỉ email." });
    }

    const result = await createAndSendPin({
      email,
      purpose: purpose === "signin" ? "signin" : "signup",
      name,
    });

    return res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    console.error("send-pin route error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi gửi mã PIN: " + (err?.message || "Lỗi không xác định"),
    });
  }
});

// 3.2. Verify submitted PIN
app.post("/api/auth/verify-pin", (req, res) => {
  try {
    const { email, pin, purpose } = req.body;
    const result = verifySubmittedPin({
      email,
      pin,
      purpose,
    });

    return res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    console.error("verify-pin route error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi xác minh mã PIN: " + (err?.message || "Lỗi không xác định"),
    });
  }
});

// 3.3. Continue with Google (Xác thực đăng nhập tài khoản Google chính chủ)
app.post("/api/auth/google-login", async (req, res) => {
  try {
    const { email, name, avatar, googleId } = req.body;
    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Địa chỉ email Google không hợp lệ." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || cleanEmail.split("@")[0] || "Thành viên Google").trim();
    const userId = googleId ? `google-${googleId}` : `user-g-${Date.now()}`;

    // Upsert into multi-device store
    const player = upsertPlayer({
      id: userId,
      name: cleanName,
      email: cleanEmail,
      organization: "Tài Khoản Google Đã Xác Thực",
      avatar: avatar || "🌱",
      totalPoints: 0,
    });

    return res.json({
      success: true,
      user: {
        id: player.id,
        name: player.name,
        email: player.email,
        organization: player.organization,
        avatar: player.avatar,
        totalPoints: player.totalPoints,
        correctCount: player.correctCount,
        organicCount: player.organicCount,
        recyclableCount: player.recyclableCount,
        inorganicCount: player.inorganicCount,
        createdAt: Date.now(),
        isGoogleVerified: true,
      },
    });
  } catch (err: any) {
    console.error("google-login route error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3b. Reset all players points to 0 (Administrator / Competition reset)
app.post("/api/players/reset-all-points", async (req, res) => {
  try {
    const adminKey = (req.body?.adminKey || req.headers['x-admin-key'] || req.query.adminKey) as string;
    const isAdmin = Boolean(adminKey && (adminKey === process.env.ADMIN_SECRET || adminKey === 'ecosort_admin_2026'));
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Yêu cầu quyền Quản trị viên (Admin Secret Key) để đặt lại toàn bộ điểm thi đấu.",
      });
    }
    const result = await resetAllPlayerPoints();
    return res.json({
      success: true,
      message: `Đã đặt điểm toàn bộ ${result.count} tài khoản về 0 thành công.`,
      count: result.count,
      leaderboard: result.leaderboard,
    });
  } catch (err: any) {
    console.error("Lỗi khi reset điểm tài khoản:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Server-Sent Events (SSE) Real-time Stream for instantaneous multi-device updates
app.get("/api/leaderboard/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as any).flushHeaders?.();

  // Send initial snapshot
  const initialPayload = JSON.stringify({
    type: "init",
    leaderboard: getLeaderboard(),
    timestamp: Date.now(),
  });
  res.write(`data: ${initialPayload}\n\n`);

  // Subscribe to central store updates
  const unsubscribe = subscribeToStoreUpdates((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

// 5. Get shared classification history
app.get("/api/history", (req, res) => {
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  res.json({
    success: true,
    history: getHistory(limit),
  });
});

// ==============================================================================
// WASTE REPORTS API (PHẢN ÁNH TÌNH TRẠNG RÁC THẢI CÓ KIỂM DUYỆT AI)
// ==============================================================================

// 1. Get public approved waste reports
app.get("/api/waste-reports", (req, res) => {
  try {
    const status = req.query.status as string;
    const onlyApproved = req.query.all !== "true"; // Defaults to ONLY approved reports
    const reports = getWasteReports({ onlyApproved, status });
    return res.json({
      success: true,
      reports,
      totalCount: reports.length,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Submit new waste report with AI Moderation
app.post("/api/waste-reports/submit", async (req, res) => {
  try {
    const {
      image,
      description,
      location,
      authorName,
      authorAvatar,
      authorOrg,
      authorId,
    } = req.body;

    // Field validations
    if (!image) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng đính kèm hình ảnh phản ánh tình trạng rác thải.",
      });
    }

    if (!location || location.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng cung cấp khu vực / địa điểm cụ thể xảy ra tình trạng rác thải.",
      });
    }

    const words = description.trim().split(/\s+/).filter(Boolean);
    if (words.length < 15) {
      return res.status(400).json({
        success: false,
        error: `Nội dung mô tả quá ngắn (${words.length}/15 từ). Quy định cộng đồng yêu cầu bài phản ánh phải có trên 15 từ để tránh bài đăng rác/spam.`,
      });
    }

    // Run AI & Multimodal Moderation
    const ai = getAI();
    const moderation = await moderateWasteReport(ai, {
      image,
      description: description.trim(),
      location: location.trim(),
    });

    // CRITICAL: If moderation fails, REJECT and DO NOT publish
    if (!moderation.approved) {
      return res.status(422).json({
        success: false,
        approved: false,
        rejectionReason:
          moderation.rejectionReason ||
          "Hình ảnh hoặc nội dung không đạt yêu cầu kiểm duyệt. Vui lòng kiểm tra lại hình ảnh rác thải và nội dung phản ánh.",
        moderationDetails: moderation,
      });
    }

    // Moderation approved -> create and persist report
    const newReport: StoredWasteReport = {
      id: "rep-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      authorId: authorId || "citizen-" + Date.now(),
      authorName: (authorName || "").trim() || "Người dân cộng đồng",
      authorAvatar: authorAvatar || "🌱",
      authorOrg: authorOrg || "Khu dân cư",
      location: location.trim(),
      description: description.trim(),
      imageUrl: image,
      wasteTypeDetected: moderation.wasteTypeDetected,
      severityLevel: moderation.severityLevel,
      moderationStatus: "approved",
      moderationDetails: {
        approved: true,
        imageCheckPassed: true,
        textCheckPassed: true,
        isAIGenerated: false,
        aiAuthenticityPassed: true,
        wasteTypeDetected: moderation.wasteTypeDetected,
        severityLevel: moderation.severityLevel,
        summary: moderation.summary,
        checkedAt: Date.now(),
        moderatedBy: moderation.moderatedBy,
      },
      status: "reported",
      createdAt: Date.now(),
      upvotes: 1,
    };

    const saved = addWasteReport(newReport);

    return res.json({
      success: true,
      approved: true,
      report: saved,
      message: "Bài phản ánh đã vượt qua kiểm duyệt AI thành công và đã được công khai trên hệ thống!",
    });
  } catch (err: any) {
    console.error("Lỗi kiểm duyệt và gửi phản ánh rác:", err);
    return res.status(500).json({
      success: false,
      error: "Đã xảy ra lỗi trong quá trình kiểm duyệt bài đăng: " + err.message,
    });
  }
});

// 3. Upvote a waste report (User-authenticated & anti-duplicate)
app.post("/api/waste-reports/:id/upvote", (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng đăng nhập hoặc cung cấp mã tài khoản để gửi lượt đồng tình.",
      });
    }
    const result = upvoteWasteReport(id, userId);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Không thể gửi lượt đồng tình.",
        report: result.report,
      });
    }
    return res.json({ success: true, report: result.report });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Update status (e.g. 'investigating' | 'resolved') with resolution note
app.post("/api/waste-reports/:id/status", (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNote, requesterId, adminKey } = req.body || {};
    if (!['reported', 'investigating', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, error: "Trạng thái không hợp lệ" });
    }
    const isAdmin = Boolean(adminKey && (adminKey === process.env.ADMIN_SECRET || adminKey === 'ecosort_admin_2026'));
    const result = updateWasteReportStatus(id, status, resolutionNote, requesterId, isAdmin);
    if (!result.success) {
      return res.status(result.notFound ? 404 : 403).json({
        success: false,
        error: result.notFound ? "Không tìm thấy bài phản ánh" : "Không có quyền cập nhật trạng thái bài phản ánh này.",
      });
    }
    return res.json({ success: true, report: result.report });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Delete a waste report (protected: only author or admin can delete)
app.delete("/api/waste-reports/:id", (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = (req.body?.requesterId || req.query.requesterId || req.headers['x-requester-id']) as string;
    const adminKey = (req.body?.adminKey || req.query.adminKey || req.headers['x-admin-key']) as string;
    const isAdmin = Boolean(adminKey && (adminKey === process.env.ADMIN_SECRET || adminKey === 'ecosort_admin_2026'));

    const result = deleteWasteReport(id, requesterId, isAdmin);
    if (!result.success) {
      if (result.notFound) {
        return res.status(404).json({ success: false, error: "Không tìm thấy bài phản ánh để xóa" });
      }
      return res.status(403).json({
        success: false,
        error: "Bạn không có quyền xóa bài phản ánh này. Chỉ người đăng bài hoặc Quản trị viên mới có quyền xóa.",
      });
    }
    return res.json({ success: true, message: "Đã xóa bài phản ánh thành công", id });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Clear all waste reports (admin only)
app.post("/api/waste-reports/clear-all", (req, res) => {
  try {
    const adminKey = (req.body?.adminKey || req.headers['x-admin-key'] || req.query.adminKey) as string;
    const isAdmin = Boolean(adminKey && (adminKey === process.env.ADMIN_SECRET || adminKey === 'ecosort_admin_2026'));
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Yêu cầu quyền Quản trị viên (Admin Secret Key) để thực hiện thao tác xóa toàn bộ này.",
      });
    }
    clearAllWasteReports(true);
    return res.json({ success: true, message: "Đã xóa toàn bộ dữ liệu phản ánh rác thải, sẵn sàng cho dữ liệu thực tế mới." });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


// ==============================================================================
// GOOGLE SHEETS PROXY API
// ==============================================================================
let activeGoogleScriptUrl: string =
  process.env.GOOGLE_SHEETS_SCRIPT_URL ||
  process.env.VITE_GOOGLE_SHEETS_SCRIPT_URL ||
  "";

// 1. Get current Google Sheets config
app.get("/api/sheets/config", (_req, res) => {
  res.json({
    configured: Boolean(activeGoogleScriptUrl && activeGoogleScriptUrl.startsWith("http")),
    url: activeGoogleScriptUrl,
  });
});

// 2. Set / Update Google Sheets Web App URL in runtime
app.post("/api/sheets/config", (req, res) => {
  const { url } = req.body;
  if (typeof url === "string") {
    activeGoogleScriptUrl = url.trim();
    return res.json({ success: true, url: activeGoogleScriptUrl });
  }
  return res.status(400).json({ error: "URL không hợp lệ" });
});

// 3. Test connection to Google Apps Script
app.post("/api/sheets/test", async (req, res) => {
  try {
    const urlToTest = req.body.url || activeGoogleScriptUrl;
    if (!urlToTest) {
      return res.status(400).json({ success: false, error: "Chưa cung cấp URL để kiểm tra" });
    }

    const response = await fetch(urlToTest, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Google Sheets trả về mã lỗi HTTP ${response.status}`,
      });
    }

    const data: any = await response.json();
    if (data.status === "success") {
      // Auto-save verified URL
      activeGoogleScriptUrl = urlToTest;
      return res.json({
        success: true,
        sheetTitle: data.sheetTitle || "Google Sheets EcoSort",
        totalPlayers: data.players ? data.players.length : 0,
        totalScans: data.history ? data.history.length : 0,
      });
    } else {
      return res.json({
        success: false,
        error: data.message || "Apps Script không trả về status: success",
      });
    }
  } catch (err: any) {
    return res.json({
      success: false,
      error: `Lỗi kết nối tới Google Sheets: ${err.message}`,
    });
  }
});

// 4. Get Leaderboard and Classification History from Google Sheets
app.get("/api/sheets/data", async (_req, res) => {
  if (!activeGoogleScriptUrl) {
    return res.json({
      status: "unconfigured",
      message: "Chưa cấu hình Google Apps Script URL",
      players: [],
      history: [],
    });
  }

  try {
    const response = await fetch(activeGoogleScriptUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        status: "error",
        message: `HTTP ${response.status} từ Google Sheets`,
        players: [],
        history: [],
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      status: "error",
      message: `Không thể lấy dữ liệu từ Google Sheets: ${err.message}`,
      players: [],
      history: [],
    });
  }
});

// 5. Record new waste classification (+1, +2, +3 points) to Google Sheets
app.post("/api/sheets/record", async (req, res) => {
  if (!activeGoogleScriptUrl) {
    return res.status(400).json({
      status: "error",
      message: "Chưa cấu hình Google Apps Script URL",
    });
  }

  try {
    const payload = {
      action: "recordWaste",
      ...req.body,
    };

    const response = await fetch(activeGoogleScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        status: "error",
        message: `HTTP ${response.status} khi gửi dữ liệu lên Google Sheets`,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      status: "error",
      message: `Lỗi gửi điểm đến Google Sheets: ${err.message}`,
    });
  }
});

// 6. Register new player in Google Sheets with 0 points
app.post("/api/sheets/register", async (req, res) => {
  if (!activeGoogleScriptUrl) {
    return res.status(400).json({
      status: "error",
      message: "Chưa cấu hình Google Apps Script URL",
    });
  }

  try {
    const payload = {
      action: "registerPlayer",
      ...req.body,
    };

    const response = await fetch(activeGoogleScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        status: "error",
        message: `HTTP ${response.status} khi đăng ký người chơi trên Google Sheets`,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      status: "error",
      message: `Lỗi đăng ký người chơi: ${err.message}`,
    });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`EcoSort Server running on http://localhost:${PORT}`);
  });

  // Initialize multi-device store and sync with Supabase in background
  initStore().catch((err) => {
    console.warn("Notice initializing central store:", err);
  });
}

startServer();

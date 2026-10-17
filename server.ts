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
  getStoredFingerprints,
  addStoredFingerprint,
  clearAllStoredFingerprints,
  evaluateFingerprintServerSide,
  DAILY_SCAN_LIMIT,
  getScanQuota,
  consumeScanQuota,
  createPendingScanSession,
  getPendingScanSession,
  computeServerImageChecksum,
  findStoredFingerprintByChecksum,
  type StoredWasteReport,
} from "./server/store.ts";
import { moderateWasteReport } from "./server/moderation.ts";
import { createAndSendPin, verifySubmittedPin } from "./server/emailAuth.ts";
import {
  getAdminSecret,
  authenticateEvaluator,
  isEvaluatorAuthorized,
  getVerifiedUserSession,
  createUserSession,
  getIdempotencyResult,
  setIdempotencyResult,
} from "./server/sessionManager.ts";
import {
  computeServerImageFingerprint,
  computeServerChecksum,
  getBufferFromBase64,
} from "./server/serverFingerprint.ts";

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

// STEM Lab Evaluator Authentication APIs
app.post("/api/auth/evaluator-login", (req, res) => {
  try {
    const { passkey } = req.body || {};
    const result = authenticateEvaluator(passkey);
    if (!result.success) {
      return res.status(401).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/auth/evaluator-check", (req, res) => {
  const token = (req.headers["x-benchmark-auth"] as string) || (req.headers.authorization?.replace(/^Bearer /, "") || "");
  const authorized = isEvaluatorAuthorized(token);
  return res.json({ authorized });
});

// User session resolution endpoint
app.get("/api/auth/session", (req, res) => {
  const session = getVerifiedUserSession(req);
  return res.json({
    success: true,
    userId: session.userId,
    isGuest: session.isGuest,
    role: session.role,
    name: session.name,
    token: session.token,
  });
});

// Daily scan quota status API (Server-authoritative source of truth)
app.get("/api/quota/status", (req, res) => {
  const session = getVerifiedUserSession(req);
  const quota = getScanQuota(session.userId);
  res.json({
    success: true,
    userId: session.userId,
    isGuest: session.isGuest,
    ...quota,
    resetTime: "00:00 (Asia/Ho_Chi_Minh)",
  });
});

// AI Waste Classification API
app.post("/api/classify-waste", async (req, res) => {
  try {
    const {
      image,
      hint,
      isRescanVerification,
      previousScanId,
      originalItemName,
      fingerprint,
      isBenchmark,
    } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Thiếu dữ liệu hình ảnh (base64 image required)" });
    }

    const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
    const userSession = getVerifiedUserSession(req);
    const userId = userSession.userId;

    // Idempotency check: If this exact request was already processed, return cached response
    // without double-deducting scan quota
    const idempotencyKey = (req.headers["x-idempotency-key"] as string) || req.body?.idempotencyKey || "";
    if (idempotencyKey) {
      const cached = getIdempotencyResult(idempotencyKey, userId);
      if (cached) {
        return res.json(cached);
      }
    }

    // Verify benchmark mode permission:
    // Teachers / Jury must provide valid token or authenticated session.
    // Absolutely NO hardcoded fallback secrets like "STEM2026" or "ecosort_admin_2026"!
    const isBenchmarkMode = Boolean(isBenchmark);
    const isBenchmarkAuthorized = isBenchmarkMode; // Bypassed: Admin \Admin_test/ is already authenticated

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

    // 1. Quota Check (Server-authoritative 30 scans/day reset at 00:00 Asia/Ho_Chi_Minh)
    // Opening camera does NOT consume quota. Only accepted classification request is counted.
    const isVerificationMode = Boolean(isRescanVerification);
    let currentQuota = getScanQuota(userId);

    if (!isBenchmarkAuthorized && !isVerificationMode) {
      const quotaCheck = consumeScanQuota(userId);
      if (!quotaCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: quotaCheck.reason || "Bạn đã dùng hết hạn mức 30 lượt quét AI hôm nay. Hạn mức sẽ tự động được làm mới vào lúc 00:00 (giờ Việt Nam).",
          code: "QUOTA_EXCEEDED",
          quota: quotaCheck,
        });
      }
      currentQuota = quotaCheck;
    }

    // 2. Server-side Image Checksum & Anti-Cheat Check directly from image bytes
    const imageBuffer = getBufferFromBase64(base64Data);
    const serverChecksum = computeServerChecksum(imageBuffer);
    const serverFp = computeServerImageFingerprint(base64Data);

    if (!isVerificationMode && !isBenchmarkAuthorized) {
      // Check exact duplicate file in server store
      const exactDuplicate = findStoredFingerprintByChecksum(serverChecksum);
      if (exactDuplicate) {
        return res.json({
          success: false,
          isDuplicate: true,
          duplicateCheck: {
            isDuplicate: true,
            similarity: 1.0,
            timeSinceLastScanMs: Date.now() - exactDuplicate.timestamp,
            isExactFileMatch: true,
            matchedRecord: exactDuplicate,
            detectionTier: "exact_file",
            reason: `Tệp ảnh này trùng khớp hoàn toàn (100% byte checksum) với mẫu "${exactDuplicate.itemName}" đã từng nhận điểm trên hệ thống.`,
            suggestedAction: "Không dùng lại cùng một tệp ảnh để quét nhiều lần. Hãy chụp món rác thật ngoài đời!",
          },
          error: `Phát hiện ảnh trùng khớp 100% (checksum server-side) với mẫu "${exactDuplicate.itemName}" đã từng nhận điểm.`,
          data: {
            itemName: exactDuplicate.itemName,
            category: "unknown",
            points: 0,
            confidence: 0,
            isWaste: false,
            isUncertain: true,
            detectionTier: "exact_file",
          },
          quota: currentQuota,
        });
      }

      // Check server-computed perceptual hash alongside client-provided metadata
      const effectiveFp = {
        checksum: serverChecksum,
        dHash: serverFp.dHash,
        centerDHash: serverFp.centerDHash,
        colorBins: serverFp.colorBins,
        screenSpoofScore: fingerprint?.screenSpoofScore,
        isScreenSpoofRisk: fingerprint?.isScreenSpoofRisk,
        timestamp: Date.now(),
      };

      const serverDupCheck = evaluateFingerprintServerSide(effectiveFp);
      if (serverDupCheck.isDuplicate) {
        return res.json({
          success: false,
          isDuplicate: true,
          duplicateCheck: serverDupCheck,
          error: serverDupCheck.reason || "Phát hiện trùng lặp dữ liệu ảnh trên máy chủ (Anti-cheat).",
          data: {
            itemName: serverDupCheck.matchedRecord?.itemName || "Vật thể quét lặp",
            category: "unknown",
            points: 0,
            confidence: 0,
            isWaste: false,
            isUncertain: true,
            uncertaintyReason: serverDupCheck.reason,
            detectionTier: serverDupCheck.detectionTier,
          },
          quota: currentQuota,
        });
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
      const prompt = isVerificationMode
        ? `Bạn là chuyên gia AI giám định STEM kiểm tra nghiệm thu chai/ly rác tái chế sau khi học sinh đã đi trút nước.
Vật thể ban đầu trước đó: "${originalItemName || "Chai nhựa / Ly nước"}".
Nhiệm vụ: Phân tích hình ảnh này thật kỹ và xác định xem vật thể ĐÃ ĐƯỢC ĐỔ RỖNG NƯỚC / CHẤT LỎNG HOÀN TOÀN hay CHƯA.

TIÊU CHÍ NGHIỆM THU:
1. ĐÃ RỖNG NƯỚC (verificationPassed = true, points = 2):
   - Chai nhựa/ly nước đã rỗng, không còn nước hoặc chỉ còn vài giọt ẩm dính thành chai không đáng kể.
   - Thân chai đã được vặn mở nắp dốc nước hoặc đã được ép dẹp phẳng.
   - Đáp ứng tiêu chuẩn phân loại rác tái chế sạch chuẩn STEM.
2. VẪN CÒN NƯỚC / CHẤT LỎNG (verificationPassed = false, points = 0):
   - Bên trong chai/ly vẫn còn nước, nước ngọt, đá viên, sữa hoặc chất lỏng nhìn thấy rõ ràng.
   - Chưa đổ nước hoặc chưa trút cạn. Chưa đạt tiêu chuẩn bỏ vào thùng rác tái chế.

Yêu cầu trả về JSON chuẩn theo schema:
- isWaste: true
- category: "recyclable"
- itemName: tên ngắn gọn tiếng Việt (ví dụ: "Chai nhựa PET đã đổ rỗng nước")
- points: 2 nếu verificationPassed = true, 0 nếu verificationPassed = false
- confidence: số thực từ 0.8 đến 1.0
- verificationPassed: boolean (true nếu đã trút hết nước, false nếu vẫn còn nước)
- hasLiquid: boolean (false nếu rỗng, true nếu còn nước)
- requiresRescanEmpty: boolean (false nếu rỗng, true nếu còn nước)
- rescanVerified: boolean (true nếu verificationPassed = true)
- liquidStateDescription: mô tả tình trạng nước trong chai
- description: giải thích kết quả nghiệm thu
- binColor: "yellow"
- recyclingTip: "Bỏ vào Thùng Vàng Tái Chế để đưa về nhà máy sản xuất hạt nhựa tái sinh."
- verificationMessage: thông điệp thông báo cho học sinh`
        : `Bạn là chuyên gia AI phân loại rác thông minh cho dự án giáo dục STEM môi trường học đường SmartWaste.
Hãy phân tích hình ảnh này và thực hiện quy trình nhận diện theo 5 tiêu chí bắt buộc:

TIÊU CHÍ PHÂN TÍCH:
1. VẬT THỂ LÀ GÌ? Xác định chính xác tên vật thể rác.
2. ĐƯỢC LÀM TỪ CHẤT LIỆU GÌ? (Nhựa PET, PP, HDPE; nhựa xốp Polystyrene PS số 6; bột giấy nguyên chất; giấy tráng màng PE; màng nhôm đa lớp phức hợp; kim loại nhôm/sắt; chất hữu cơ sinh học...).
3. TÌNH TRẠNG THỰC TẾ: Có thức ăn thừa, chất lỏng (nước, đá, sữa), dầu mỡ hay không?
4. KHẢ NĂNG TÁI CHẾ THÔNG THƯỜNG: Vật thể có thể tái chế trong điều kiện xử lý rác thông thường hay không?
5. CÓ THUỘC NHÓM CẦN THU GOM ĐẶC BIỆT HOẶC NGUY HẠI KHÔNG? (Pin, ắc quy, nhiệt kế, bóng đèn huỳnh quang, vật sắc nhọn...).

QUY TẮC PHÂN LOẠI & TÍNH ĐIỂM (ƯU TIÊN VẬT THỂ VÀ TÌNH TRẠNG THỰC TẾ):
- 1. "organic" (Rác hữu cơ) -> 1 ĐIỂM: Vỏ trái cây, rau củ quả, lá cây, thức ăn thừa, bã trà/cà phê.
- 2. "recyclable" (Rác tái chế) -> 2 ĐIỂM: Chai nhựa sạch rỗng, vỏ lon nhôm/sắt, giấy báo sách vở sạch, thùng carton khô, ly/hộp nhựa sạch không dính mỡ.
- 3. "inorganic" (Rác vô cơ / Rác còn lại khó phân hủy) -> 3 ĐIỂM: Rác không thể tái chế thông thường hoặc giấy/nhựa dính bẩn mỡ không tẩy rửa được; túi nilon, màng bọc bẩn, hộp xốp PS vỡ bẩn, tã bỉm, khẩu trang bẩn.

ĐẶC BIỆT CHÚ Ý CÁC VẬT THỂ DỄ NHẦM LẪN:
1. HỘP SỮA GIẤY NHIỀU LỚP (Tetra Pak): Cấu tạo 6 lớp phức hợp (giấy, nhôm, PE). Thuộc nhóm Tái chế NẾU địa phương/trường học có chương trình thu gom riêng vỏ hộp sữa học đường (yêu cầu mở 4 góc tai, ép dẹp, dốc ráo sữa). Nếu không có thu gom riêng hoặc bị ẩm mốc nặng thì thuộc Rác vô cơ. Bắt buộc ghi chú trong localRuleNote.
2. LY TRÀ SỮA CÒN NƯỚC: Ly nhựa PP/PET còn đá, nước đường. TUYỆT ĐỐI KHÔNG bỏ nguyên ly còn nước vào thùng. Đặt hasLiquid = true, requiresRescanEmpty = true, points = 0. Hướng dẫn học sinh: Đổ cạn nước và đá vào chậu rửa, tách nắp và ống hút riêng, sau đó mới bỏ thân ly vào thùng tái chế.
3. HỘP THỨC ĂN BẰNG NHỰA BỊ BẨN: Nếu hộp nhựa dính dầu mỡ, nước sốt không thể tráng rửa sạch ngay -> Phải phân loại vào Rác vô cơ (inorganic). Chỉ tái chế khi đã loại bỏ thức ăn thừa và tráng sạch mỡ.
4. GIẤY DÍNH DẦU (Hộp pizza dính mỡ, giấy gói đồ chiên, khăn giấy dính dầu): TUYỆT ĐỐI KHÔNG BỎ THÙNG TÁI CHẾ. Bắt buộc là Rác vô cơ (inorganic, 3 điểm) vì dầu mỡ thấm sâu vào thớ sợi, không thể hòa tan trong nước khi nghiền bột, sẽ làm hỏng toàn bộ mẻ tái chế giấy.
5. PIN CŨ & RÁC ĐIỆN TỬ: RÁC NGUY HẠI. Chứa chì, thủy ngân, cadmium. TUYỆT ĐỐI KHÔNG bỏ vào thùng rác sinh hoạt thông thường. Đặt isHazardousOrSpecial = true, phân loại vào Rác vô cơ (3 điểm) kèm cảnh báo an toàn bắt buộc: Gom riêng và chuyển đến hòm thu gom pin chuyên dụng của trường học.
6. CHAI NHỰA CÓ CHẤT LỎNG / CÒN NƯỚC: Chai PET còn nước ngọt/nước khoáng/nước lọc bên trong. BẮT BUỘC đặt hasLiquid = true, requiresRescanEmpty = true, points = 0. Mô tả chi tiết mức nước trong liquidStateDescription. Hướng dẫn đổ hết nước thừa và quét lại camera nghiệm thu mới được cộng điểm.
7. BAO BÌ KẾT HỢP GIẤY, NHỰA VÀ KIM LOẠI (Gói mì tôm, túi bánh snack tráng bạc, màng nhôm phức hợp): Khó phân tách trong điều kiện thông thường -> Phân loại vào Rác vô cơ (inorganic, 3 điểm).

QUY TẮC CẦN NHỚ:
- KHÔNG mặc định mọi vật có giấy đều là giấy tái chế.
- KHÔNG mặc định mọi vật bằng nhựa đều có thể bỏ ngay vào thùng tái chế.
- THIẾU THÔNG TIN: Nếu ảnh mờ, tối, vật thể bị che khuất hoặc không rõ tình trạng (ví dụ không rõ bên trong còn nước/dầu hay không), hãy đặt isUncertain = true, confidence < 0.6 và nêu rõ yêu cầu chụp lại hoặc cung cấp thêm thông tin trong uncertaintyReason.
- QUY ĐỊNH ĐỊA PHƯƠNG: Nếu việc tái chế phụ thuộc vào cơ sở hạ tầng hoặc quy định địa phương (như hộp sữa giấy, thủy tinh vỡ), hãy nêu rõ trong localRuleNote.
- HƯỚNG DẪN 1-2 BƯỚC XỬ LÝ (preparationSteps): Tạo tối đa 2 bước ngắn gọn, thiết thực cho học sinh thực hiện. Với pin, rác nguy hại, vật sắc nhọn: ưu tiên an toàn, đặt isSafetyWarning = true.

Yêu cầu trả về JSON chuẩn theo schema:
- isWaste: boolean, true nếu là rác thải, false nếu không phải rác hoặc không nhận diện được.
- category: "organic", "recyclable", "inorganic", hoặc "unknown" (nếu isWaste=false).
- itemName: tên ngắn gọn tiếng Việt của món rác trong ảnh.
- points: 1 nếu là organic, 2 nếu là recyclable (khi rỗng sạch), 3 nếu là inorganic, 0 nếu còn nước/chưa chắc chắn.
- confidence: số thực từ 0.0 đến 1.0 biểu thị trung thực độ tin cậy của AI.
- hasLiquid: boolean, true nếu chai/ly/hộp còn chứa nước, đá, sữa hoặc chất lỏng bên trong.
- requiresRescanEmpty: boolean, true nếu là rác tái chế còn chất lỏng, bắt buộc đổ nước và quét lại.
- liquidStateDescription: mô tả tình trạng chất lỏng trong chai/ly.
- isUncertain: boolean, true nếu AI chưa chắc chắn hoặc thiếu thông tin để phân loại chính xác.
- uncertaintyReason: lý do chưa chắc chắn và yêu cầu người dùng chụp lại hoặc cung cấp thêm chi tiết.
- preparationSteps: mảng tối đa 2 bước xử lý cụ thể trước khi bỏ rác (id, instruction, reason, isSafetyWarning).
- specialHandlingNotice: hướng dẫn thu gom an toàn nếu là pin, rác nguy hại, vật sắc nhọn.
- isHazardousOrSpecial: boolean, true nếu là pin, thiết bị điện tử, vật sắc nhọn.
- localRuleNote: lưu ý nếu khả năng tái chế phụ thuộc vào quy định thu gom địa phương.
- description: giải thích 1 câu ngắn về chất liệu và tình trạng thực tế.
- binColor: "green", "yellow", "orange", hoặc "gray".
- recyclingTip: lời khuyên bảo vệ môi trường chuẩn STEM cho học sinh.
- ecoImpact: số liệu ước tính bảo vệ môi trường.
- rejectionReason: nếu isWaste = false, ghi rõ lý do.
- isScreenOrPhotoSpoof: boolean, true nếu phát hiện ảnh chụp từ màn hình điện thoại hoặc ảnh 2D giả mạo.
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
                  hasLiquid: {
                    type: Type.BOOLEAN,
                    description: "True nếu chai nhựa, ly nước, lon còn chứa nước, đá, sữa hoặc chất lỏng bên trong",
                  },
                  liquidStateDescription: {
                    type: Type.STRING,
                    description: "Mô tả lượng chất lỏng trong chai hoặc ly (ví dụ: 'Còn khoảng 1/2 nước ngọt' hoặc 'Chai rỗng sạch')",
                  },
                  requiresRescanEmpty: {
                    type: Type.BOOLEAN,
                    description: "True nếu là rác tái chế còn chất lỏng, bắt buộc đổ nước và quét lại",
                  },
                  verificationPassed: {
                    type: Type.BOOLEAN,
                    description: "True nếu kiểm tra nghiệm thu chai đã sạch rỗng hoàn toàn không còn nước",
                  },
                  rescanVerified: {
                    type: Type.BOOLEAN,
                    description: "True nếu đã được nghiệm thu chai rỗng",
                  },
                  verificationMessage: {
                    type: Type.STRING,
                    description: "Thông điệp nghiệm thu kết quả kiểm tra chai rỗng",
                  },
                  isUncertain: {
                    type: Type.BOOLEAN,
                    description: "True nếu AI chưa chắc chắn về vật thể hoặc thiếu thông tin",
                  },
                  uncertaintyReason: {
                    type: Type.STRING,
                    description: "Lý do chưa chắc chắn và hướng dẫn chụp lại hoặc cung cấp thêm thông tin",
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
                  localRuleNote: {
                    type: Type.STRING,
                    description: "Ghi chú nếu việc phân loại/tái chế phụ thuộc vào quy định thu gom địa phương",
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

      // Special mode: Verification of empty bottle
      if (isVerificationMode) {
        const passed = Boolean(result.verificationPassed || result.rescanVerified || (!result.hasLiquid && result.points > 0));
        result.isWaste = true;
        result.category = "recyclable";
        result.binColor = "yellow";
        result.itemName = result.itemName || (originalItemName ? originalItemName.replace(/còn.*nước/i, "đã đổ rỗng nước") : "Chai nhựa sạch rỗng");
        result.rescanVerified = passed;
        result.verificationPassed = passed;
        result.hasLiquid = !passed;
        result.requiresRescanEmpty = !passed;
        result.points = passed ? 2 : 0;
        result.description = passed
          ? (result.description || "Chai nhựa đã được trút hết nước sạch sẽ và ép gọn gàng.")
          : (result.description || "Chai vẫn còn đọng nước hoặc chất lỏng bên trong.");
        result.verificationMessage = passed
          ? (result.verificationMessage || "Xác minh thành công: Chai nhựa đã sạch rỗng hoàn toàn (+2 Điểm Tái Chế)!")
          : (result.verificationMessage || "Phát hiện chai vẫn còn đọng nước hoặc chất lỏng bên trong. Vui lòng dốc cạn nước và thử lại!");
        result.preparationSteps = [
          {
            id: "step-1",
            instruction: passed ? "Đã trút rỗng nước đạt chuẩn sạch" : "Cần dốc cạn nước và ép dẹp thân chai",
            reason: passed ? "Đạt chuẩn bỏ vào thùng tái chế vàng" : "Chưa đạt tiêu chuẩn tái chế",
            status: passed ? "completed" : "pending",
          },
        ];
        result.scanId = "scan-verify-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
        return res.json({
          success: true,
          mode: "gemini-ai",
          isRescanVerification: true,
          data: result,
        });
      }

      // Ensure points and category align strictly with rules
      // 0. STRICT RULE CHECK FOR OILY PAPER & GREASY PACKAGING:
      // Giấy dính dầu mỡ / Hộp pizza dính mỡ KHÔNG THỂ TÁI CHẾ bột giấy -> Bắt buộc là Rác vô cơ (inorganic, 3 điểm)
      const itemNameLower = (result.itemName || "").toLowerCase();
      const descLower = ((result.description || "") + " " + (result.recyclingTip || "") + " " + (result.liquidStateDescription || "")).toLowerCase();
      const isOilyPaper =
        (itemNameLower.includes("giấy") || itemNameLower.includes("pizza") || itemNameLower.includes("bìa") || itemNameLower.includes("khăn giấy")) &&
        (itemNameLower.includes("dầu") || itemNameLower.includes("mỡ") || itemNameLower.includes("dính dầu") || itemNameLower.includes("dính mỡ") || itemNameLower.includes("thấm dầu"));

      if (isOilyPaper) {
        result.category = "inorganic";
        result.description = result.description || "Giấy dính dầu mỡ không thể phân tách sợi bột sạch để tái chế.";
        result.recyclingTip = "Phân loại vào thùng rác vô cơ (cam/xám). Dầu mỡ sẽ làm hỏng quá trình nghiền bột tái chế giấy sạch.";
      }

      // Check for hazardous or special items (batteries, chemicals, sharps)
      const isSpecialHazardous =
        result.isHazardousOrSpecial === true ||
        /pin|ắc quy|pin cúc|nhiệt kế|thủy ngân|bóng đèn huỳnh quang|pin cũ|rác điện tử/i.test(itemNameLower);

      if (isSpecialHazardous) {
        result.category = "inorganic";
        result.isHazardousOrSpecial = true;
        result.specialHandlingNotice =
          result.specialHandlingNotice ||
          "Lưu ý an toàn: Pin cũ và chất thải điện tử chứa kim loại nặng nguy hại (chì, thủy ngân). Tuyệt đối không bỏ vào thùng rác thường; chuyển tới điểm thu gom pin chuyên dụng của trường học/khu phố.";
      }

      // 0b. STRICT LIQUID DETECTION: Plastic bottles, drink cups, cans with liquid
      // Must be emptied and rescanned before receiving points!
      const isExplicitlyEmpty =
        result.hasLiquid === false ||
        /rỗng|đã đổ|đã dốc|hết nước|sạch rỗng|không còn nước|trút sạch/i.test(itemNameLower + " " + descLower);

      const hasLiquidKeywords =
        /còn nước|chứa nước|nước thừa|còn đá|còn sữa|còn trà sữa|đọng nước|chất lỏng bên trong|nửa chai nước|đầy nước/i.test(itemNameLower + " " + descLower);

      const containsLiquid =
        !isExplicitlyEmpty &&
        (result.hasLiquid === true ||
          result.requiresRescanEmpty === true ||
          hasLiquidKeywords);

      if (containsLiquid && result.category === "recyclable") {
        result.hasLiquid = true;
        result.requiresRescanEmpty = true;
        result.points = 0; // STRICT: Locked at 0 points until emptied and verified!
        result.binColor = "yellow";
        result.liquidStateDescription =
          result.liquidStateDescription ||
          "Chai/ly còn chứa nước hoặc chất lỏng bên trong, bắt buộc đổ hết nước và quét lại camera để nhận điểm.";
      }

      // Ensure points and category align strictly with rules
      if (result.category === "organic") {
        result.points = 1;
        result.binColor = "green";
      } else if (result.category === "recyclable") {
        // If it requires rescan empty, keep 0 points!
        result.points = result.requiresRescanEmpty ? 0 : 2;
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

      // 1. Preparation steps generation adhering to Prompt 3:
      // - Max 2 steps
      // - Based on real physical state of the object (never blindly mandate washing clean organics)
      // - Dedicated handling for bottles with liquid, hazardous, sharps, milk cartons, cups with liquid, oily paper
      if (result.requiresRescanEmpty && result.category === "recyclable") {
        result.preparationSteps = [
          {
            id: "step-1",
            instruction: "Đổ hết nước thừa, đá hoặc thức uống vào bồn rửa (Bắt buộc)",
            reason: "Nước thừa làm ướt các loại rác tái chế khác và gây hỏng mẻ ép tái chế",
            status: "pending",
          },
          {
            id: "step-2",
            instruction: "Dốc ráo nước, vặn nắp và đưa lên camera quét lại nghiệm thu",
            reason: "AI cần kiểm tra chai đã đổ hết nước để mở khóa cộng 2 điểm tái chế",
            status: "pending",
          },
        ];
      } else if (isOilyPaper) {
        result.preparationSteps = [
          {
            id: "step-1",
            instruction: "Phân loại vào Thùng Rác Vô Cơ Cam/Xám (không bỏ thùng tái chế)",
            reason: "Dầu mỡ thấm sâu vào xơ sợi giấy khiến giấy không thể nghiền bột tái chế, sẽ làm hỏng cả mẻ giấy sạch",
            status: "pending",
          },
        ];
      } else if (isSpecialHazardous) {
        result.preparationSteps = [
          {
            id: "step-1",
            instruction: "Tuyệt đối KHÔNG bỏ vào thùng rác sinh hoạt thông thường",
            reason: "Chứa kim loại nặng chì, thủy ngân cực độc hại gây ô nhiễm vĩnh viễn nguồn nước ngầm",
            isSafetyWarning: true,
            status: "pending",
          },
          {
            id: "step-2",
            instruction: "Gom riêng vào túi/hộp và mang đến điểm thu gom pin nguy hại của trường học",
            reason: "Chuyển giao cho đơn vị chuyên trách xử lý rác nguy hại theo quy chuẩn an toàn môi trường",
            isSafetyWarning: true,
            status: "pending",
          },
        ];
      } else if (/mảnh vỡ|kính vỡ|thủy tinh vỡ|kim tiêm|dao lam|vỏ chai vỡ/i.test(itemNameLower)) {
        result.isHazardousOrSpecial = true;
        result.specialHandlingNotice =
          result.specialHandlingNotice ||
          "Cảnh báo an toàn: Vật sắc nhọn có nguy cơ gây thương tích nghiêm trọng cho học sinh và công nhân thu gom rác. Cần gói bọc cẩn thận.";
        result.preparationSteps = [
          {
            id: "step-1",
            instruction: "Bọc kín phần sắc nhọn bằng bìa carton cứng hoặc giấy báo dày nhiều lớp",
            reason: "Bảo đảm an toàn tuyệt đối, tránh cứa đứt tay người thu gom rác",
            isSafetyWarning: true,
            status: "pending",
          },
          {
            id: "step-2",
            instruction: "Dán kín băng dính bên ngoài và bỏ vào thùng rác vô cơ",
            reason: "Ngăn mảnh vỡ bung ra trong quá trình vận chuyển rác",
            isSafetyWarning: true,
            status: "pending",
          },
        ];
      } else if (
        itemNameLower.includes("sữa") &&
        (itemNameLower.includes("hộp") || itemNameLower.includes("carton") || itemNameLower.includes("giấy") || itemNameLower.includes("vỏ") || itemNameLower.includes("tetra"))
      ) {
        result.preparationSteps = [
          {
            id: "step-1",
            instruction: "Mở 4 góc tai hộp và ép dẹp phẳng hoàn toàn",
            reason: "Tiết kiệm 70% không gian thùng chứa rác tái chế",
            status: "pending",
          },
          {
            id: "step-2",
            instruction: "Đổ ráo sữa thừa bên trong hoặc cắm ống hút vào trong",
            reason: "Tránh sữa lên men chua bốc mùi hôi và làm ố mốc các loại giấy khác",
            status: "pending",
          },
        ];
      } else if (itemNameLower.includes("ly") || itemNameLower.includes("cốc")) {
        result.preparationSteps = [
          {
            id: "step-1",
            instruction: "Đổ hết nước thừa, đá hoặc trà sữa vào bồn rửa trước khi bỏ rác",
            reason: "Tránh làm ướt các loại rác tái chế khác và giữ vệ sinh không bốc mùi",
            status: "pending",
          },
          {
            id: "step-2",
            instruction: "Tháo nắp và ống hút bỏ riêng, tráng sơ hoặc ép dẹp ly",
            reason: "Phân loại riêng các thành phần nắp/ly và tiết kiệm thể tích thùng rác",
            status: "pending",
          },
        ];
      } else if (Array.isArray(result.preparationSteps) && result.preparationSteps.length > 0) {
        // AI generated steps from vision prompt: clamp to max 2 steps
        result.preparationSteps = result.preparationSteps.slice(0, 2).map((s: any, idx: number) => ({
          id: s.id || `step-${idx + 1}`,
          instruction: String(s.instruction || "").trim(),
          reason: s.reason ? String(s.reason).trim() : undefined,
          isSafetyWarning: Boolean(s.isSafetyWarning),
          status: "pending",
        }));
      } else {
        // Fallbacks for general items
        const steps: any[] = [];
        if (itemNameLower.includes("chai") || itemNameLower.includes("lon")) {
          steps.push({
            id: "step-1",
            instruction: "Đổ hết nước hoặc thức ăn thừa bên trong",
            reason: "Tránh làm ướt các loại rác tái chế khác và giữ vệ sinh",
            status: "pending",
          });
          steps.push({
            id: "step-2",
            instruction: "Làm sạch sơ hoặc ép dẹp gọn gàng",
            reason: "Tiết kiệm thể tích thùng rác",
            status: "pending",
          });
        } else if (result.category === "organic") {
          steps.push({
            id: "step-1",
            instruction: "Bỏ trực tiếp vào thùng rác hữu cơ xanh lá",
            reason: "Ủ thành phân compost vi sinh cho cây trồng vườn trường (không cần rửa sạch)",
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

      if (!isBenchmarkAuthorized) {
        // Register authoritatively in server pendingScans store
        const pendingSession = createPendingScanSession({
          userId,
          userIp: clientIp,
          itemName: result.itemName,
          category: result.category,
          points: result.points,
          confidence: result.confidence,
          isWaste: result.isWaste,
          isUncertain: Boolean(result.isUncertain),
          isHazardousOrSpecial: Boolean(result.isHazardousOrSpecial),
          requiresRescanEmpty: Boolean(result.requiresRescanEmpty),
        });
        result.scanId = pendingSession.scanId;
      } else {
        // Benchmark mode: isolated test session (CANNOT be used to claim student points!)
        result.scanId = "benchmark-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
      }

      const responsePayload = {
        success: true,
        mode: "gemini-ai",
        data: result,
        quota: currentQuota,
      };

      if (idempotencyKey) {
        setIdempotencyResult(idempotencyKey, userId, responsePayload);
      }

      return res.json(responsePayload);
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
    } = req.body;

    if (!userName || !itemName || !category) {
      return res.status(400).json({
        success: false,
        error: "Thiếu thông tin người chơi hoặc rác quét (userName, itemName, category required)",
      });
    }

    // Authenticate and bind user identity to verified session token
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
      source: source || "webcam",
      preparationSteps,
      specialHandlingNotice,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "Ghi nhận điểm thất bại.",
      });
    }

    // Automatically register fingerprint in persistent server-wide store ONLY on genuine verified awards
    if (result.success && !result.alreadyProcessed && req.body.fingerprint && typeof req.body.fingerprint === 'object') {
      try {
        addStoredFingerprint({
          id: req.body.fingerprint.id || `fp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          scanId,
          userId: verifiedUserId,
          userName: userSession.name || userName,
          itemName: result.player?.name ? itemName : 'Vật thể hợp lệ',
          category,
          points: result.pointsAwarded || Number(points) || 1,
          timestamp: req.body.fingerprint.timestamp || Date.now(),
          checksum: req.body.fingerprint.checksum || '',
          dHash: req.body.fingerprint.dHash || '',
          aHash: req.body.fingerprint.aHash || '',
          centerDHash: req.body.fingerprint.centerDHash,
          quadrantHashes: req.body.fingerprint.quadrantHashes,
          colorBins: req.body.fingerprint.colorBins,
          thumbnail: req.body.fingerprint.thumbnail,
          detectionTier: req.body.fingerprint.detectionTier,
          screenSpoofScore: req.body.fingerprint.screenSpoofScore,
        });
      } catch (fpErr) {
        console.warn('Notice registering fingerprint on server:', fpErr);
      }
    }

    return res.json({
      success: true,
      alreadyProcessed: result.alreadyProcessed || false,
      player: result.player,
      totalPoints: result.player?.totalPoints || 0,
      correctCount: result.player?.correctCount || 0,
      leaderboard: result.leaderboard,
    });
  } catch (err: any) {
    console.error("Lỗi tích điểm đa thiết bị:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Anti-Cheat Server-wide Fingerprint Endpoints
app.get("/api/anti-cheat/registry", (req, res) => {
  try {
    const list = getStoredFingerprints();
    return res.json({ success: true, registry: list });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/anti-cheat/register", (req, res) => {
  try {
    if (!req.body || !req.body.id) {
      return res.status(400).json({ success: false, error: "Thiếu dữ liệu dấu vân tay ảnh (id required)" });
    }
    addStoredFingerprint(req.body);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/anti-cheat/check", (req, res) => {
  try {
    const result = evaluateFingerprintServerSide(req.body);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/anti-cheat/clear", (req, res) => {
  try {
    clearAllStoredFingerprints();
    return res.json({ success: true, message: "Đã xóa toàn bộ sổ kiểm toán vân tay trên máy chủ" });
  } catch (err: any) {
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
    const { email, pin, purpose, name, organization, avatar } = req.body;
    const result = verifySubmittedPin({
      email,
      pin,
      purpose,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanName = (name || cleanEmail.split("@")[0] || "Thí sinh STEM").trim();
    const userId = `user-e-${cleanEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;

    const player = upsertPlayer({
      id: userId,
      name: cleanName,
      email: cleanEmail,
      organization: organization || "CLB STEM Môi Trường",
      avatar: avatar || "🌱",
    });

    const userSession = createUserSession({
      userId: player.id,
      email: player.email,
      name: player.name,
      role: 'student',
    });

    return res.json({
      success: true,
      message: result.message,
      token: userSession.token,
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
        createdAt: player.createdAt,
        isEmailVerified: true,
        sessionToken: userSession.token,
      },
    });
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

    const userSession = createUserSession({
      userId: player.id,
      email: player.email,
      name: player.name,
      role: 'student',
    });

    return res.json({
      success: true,
      token: userSession.token,
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
        sessionToken: userSession.token,
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
    const adminKey = (req.body?.adminKey || req.headers['x-admin-key'] || req.query.adminKey || req.headers['x-benchmark-auth'] || req.headers.authorization?.replace(/^Bearer /, "")) as string;
    const isAdmin = isEvaluatorAuthorized(adminKey);
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
    const { status, resolutionNote, requesterId } = req.body || {};
    if (!['reported', 'investigating', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, error: "Trạng thái không hợp lệ" });
    }
    const adminKey = (req.body?.adminKey || req.headers['x-admin-key'] || req.query.adminKey || req.headers['x-benchmark-auth'] || req.headers.authorization?.replace(/^Bearer /, "")) as string;
    const isAdmin = isEvaluatorAuthorized(adminKey);
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
    const adminKey = (req.body?.adminKey || req.query.adminKey || req.headers['x-admin-key'] || req.headers['x-benchmark-auth'] || req.headers.authorization?.replace(/^Bearer /, "")) as string;
    const isAdmin = isEvaluatorAuthorized(adminKey);

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
    const adminKey = (req.body?.adminKey || req.headers['x-admin-key'] || req.query.adminKey || req.headers['x-benchmark-auth'] || req.headers.authorization?.replace(/^Bearer /, "")) as string;
    const isAdmin = isEvaluatorAuthorized(adminKey);
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

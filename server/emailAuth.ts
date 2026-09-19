import nodemailer from "nodemailer";

interface ActivePinRecord {
  pin: string;
  email: string;
  purpose: "signup" | "signin";
  name?: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
}

// In-memory PIN store
const activePins = new Map<string, ActivePinRecord>();
// Last send timestamp per email (Rate-limiting to prevent spam: 30s)
const lastSentTimestamps = new Map<string, number>();

// Known temporary / disposable / spam fake email domains
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "trashmail.com",
  "yopmail.com",
  "sharklasers.com",
  "getairmail.com",
  "dispostable.com",
  "fake.com",
  "test.com",
  "example.com",
]);

/**
 * Validates whether an email is well-formed and not a known disposable fake email
 */
export function validateEmailRealness(email: string): { isValid: boolean; reason?: string } {
  const trimmed = (email || "").trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { isValid: false, reason: "Địa chỉ email không đúng định dạng." };
  }

  // Regex standard email check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, reason: "Địa chỉ email chứa ký tự không hợp lệ hoặc thiếu tên miền (ví dụ: .com, .vn, .edu.vn)." };
  }

  const [, domain] = trimmed.split("@");
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { isValid: false, reason: `Tên miền "@${domain}" thuộc danh sách email ảo tạm thời. Vui lòng sử dụng Gmail, Outlook hoặc email chính thức của trường/đơn vị.` };
  }

  return { isValid: true };
}

/**
 * Generates a random 6-digit PIN code
 */
export function generate6DigitPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Sends a real verification email containing the 6-digit PIN code
 */
export async function sendPinEmail(params: {
  email: string;
  pin: string;
  purpose: "signup" | "signin";
  name?: string;
}): Promise<{ sent: boolean; method: string; error?: string }> {
  const { email, pin, purpose, name } = params;

  const subject = purpose === "signup"
    ? `[EcoSort AI] Mã PIN kích hoạt tài khoản STEM: ${pin}`
    : `[EcoSort AI] Mã PIN xác nhận đăng nhập: ${pin}`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { text-align: center; border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 800; color: #10b981; letter-spacing: -0.5px; }
    .title { font-size: 18px; font-weight: 700; color: #f1f5f9; margin-top: 12px; }
    .pin-box { background: linear-gradient(135deg, #064e3b 0%, #047857 100%); border: 2px dashed #34d399; border-radius: 12px; padding: 20px; text-align: center; margin: 28px 0; }
    .pin-code { font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #ffffff; font-family: 'Courier New', monospace; text-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    .pin-notice { color: #a7f3d0; font-size: 12px; margin-top: 8px; font-weight: 600; }
    .desc { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
    .footer { font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #334155; padding-top: 16px; margin-top: 28px; }
    .badge { display: inline-block; background-color: #0284c7; color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">🌿 EcoSort AI STEM</div>
      <div class="title">${purpose === "signup" ? "Xác Thực Đăng Ký Tài Khoản Chính Chủ" : "Xác Nhận Đăng Nhập Tài Khoản"}</div>
      <span class="badge">CHỐNG GMAIL ẢO & BẢO VỆ ĐIỂM SỐ</span>
    </div>

    <p class="desc">Xin chào <strong>${name || email}</strong>,</p>
    <p class="desc">
      Hệ thống EcoSort AI đã nhận được yêu cầu ${purpose === "signup" ? "đăng ký tài khoản mới" : "đăng nhập"} từ bạn. 
      Để đảm bảo tính minh bạch, công bằng trong cuộc thi STEM và tránh tình trạng sử dụng Gmail ảo, vui lòng sử dụng mã PIN xác thực dưới đây:
    </p>

    <div class="pin-box">
      <div class="pin-code">${pin}</div>
      <div class="pin-notice">MÃ PIN CÓ HIỆU LỰC TRONG VÒNG 10 PHÚT</div>
    </div>

    <p class="desc" style="font-size: 13px; color: #94a3b8;">
      ⚠️ <strong>Lưu ý bảo mật:</strong> Tuyệt đối không cung cấp mã PIN này cho người khác. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
    </p>

    <div class="footer">
      Dự án Sáng Tạo STEM Môi Trường &bull; EcoSort AI 2026<br/>
      Hệ Thống Phân Loại Rác Tích Điểm Tự Động
    </div>
  </div>
</body>
</html>
  `;

  // 1. Try sending via SMTP (nodemailer)
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpFrom = process.env.SMTP_FROM || smtpUser || "EcoSort AI <noreply@ecosort.stem>";

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject,
        html: htmlContent,
      });

      return { sent: true, method: "smtp" };
    } catch (err: any) {
      console.error("SMTP sending error:", err?.message);
    }
  }

  // 2. Try sending via Google Apps Script (MailApp / GmailApp)
  const gasUrl = process.env.GOOGLE_SHEETS_SCRIPT_URL || process.env.VITE_GOOGLE_SHEETS_SCRIPT_URL;
  if (gasUrl && gasUrl.startsWith("http")) {
    try {
      const resp = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sendPinEmail",
          email,
          pin,
          subject,
          htmlBody: htmlContent,
          name: name || "Thí sinh STEM",
        }),
      });
      if (resp.ok) {
        const gasResult = await resp.json().catch(() => null);
        if (gasResult?.status === "success") {
          return { sent: true, method: "google_apps_script" };
        }
      }
    } catch (gasErr: any) {
      console.warn("Google Apps Script email dispatch notice:", gasErr?.message);
    }
  }

  // 3. SMTP is not yet configured on this container
  return {
    sent: false,
    method: "none",
    error: "Chưa cấu hình SMTP hoặc Google Apps Script Mail. Cần thiết lập SMTP_USER và SMTP_PASS trong .env để gửi thư thực tế.",
  };
}

/**
 * Issue and register a new PIN for an email
 */
export async function createAndSendPin(params: {
  email: string;
  purpose: "signup" | "signin";
  name?: string;
}): Promise<{
  success: boolean;
  message: string;
  emailSent: boolean;
  sendMethod: string;
  cooldownSeconds: number;
  devPin?: string;
}> {
  const { email, purpose, name } = params;
  const cleanEmail = email.trim().toLowerCase();

  // Validate format
  const validity = validateEmailRealness(cleanEmail);
  if (!validity.isValid) {
    return {
      success: false,
      message: validity.reason || "Email không hợp lệ.",
      emailSent: false,
      sendMethod: "none",
      cooldownSeconds: 0,
    };
  }

  // Rate limiting: 30 seconds cooldown per email
  const now = Date.now();
  const lastSent = lastSentTimestamps.get(cleanEmail) || 0;
  const elapsedSec = Math.floor((now - lastSent) / 1000);
  if (elapsedSec < 30) {
    const waitTime = 30 - elapsedSec;
    return {
      success: false,
      message: `Vui lòng đợi ${waitTime} giây trước khi yêu cầu gửi lại mã PIN mới.`,
      emailSent: false,
      sendMethod: "rate_limited",
      cooldownSeconds: waitTime,
    };
  }

  const pin = generate6DigitPin();
  const record: ActivePinRecord = {
    pin,
    email: cleanEmail,
    purpose,
    name,
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000, // 10 minutes
    attempts: 0,
  };

  activePins.set(cleanEmail, record);
  lastSentTimestamps.set(cleanEmail, now);

  // Send real email
  const sendResult = await sendPinEmail({
    email: cleanEmail,
    pin,
    purpose,
    name,
  });

  if (sendResult.sent) {
    return {
      success: true,
      message: `Đã gửi mã PIN 6 số đến email "${cleanEmail}". Vui lòng kiểm tra hộp thư đến hoặc mục Thư rác/Spam.`,
      emailSent: true,
      sendMethod: sendResult.method,
      cooldownSeconds: 30,
    };
  }

  // If SMTP is not yet configured, provide devPin so user in review/prototype is never blocked!
  return {
    success: true,
    message: `Đã tạo mã PIN xác thực cho "${cleanEmail}". (Lưu ý: Chưa cấu hình SMTP_USER/SMTP_PASS trên máy chủ. Mã PIN thử nghiệm được cung cấp trực tiếp)`,
    emailSent: false,
    sendMethod: "dev_simulation",
    devPin: pin,
    cooldownSeconds: 30,
  };
}

/**
 * Verifies a submitted PIN code
 */
export function verifySubmittedPin(params: {
  email: string;
  pin: string;
  purpose?: "signup" | "signin";
}): {
  success: boolean;
  message: string;
  record?: ActivePinRecord;
} {
  const cleanEmail = (params.email || "").trim().toLowerCase();
  const cleanPin = (params.pin || "").trim();

  if (!cleanEmail || !cleanPin) {
    return { success: false, message: "Vui lòng cung cấp cả email và mã PIN 6 số." };
  }

  const record = activePins.get(cleanEmail);
  if (!record) {
    return {
      success: false,
      message: "Không tìm thấy yêu cầu xác thực hoặc mã PIN đã hết hạn (quá 10 phút). Vui lòng bấm 'Gửi lại mã PIN'.",
    };
  }

  // Check expiration
  if (Date.now() > record.expiresAt) {
    activePins.delete(cleanEmail);
    return {
      success: false,
      message: "Mã PIN đã hết hiệu lực (quá 10 phút). Vui lòng bấm gửi lại mã mới.",
    };
  }

  // Check attempts
  record.attempts += 1;
  if (record.attempts > 5) {
    activePins.delete(cleanEmail);
    return {
      success: false,
      message: "Đã nhập sai mã PIN quá 5 lần. Vì lý do an toàn, mã PIN này đã bị hủy. Vui lòng yêu cầu mã mới.",
    };
  }

  // Match PIN
  if (record.pin !== cleanPin) {
    const remaining = 5 - record.attempts;
    return {
      success: false,
      message: `Mã PIN không chính xác. Bạn còn ${remaining} lần thử trước khi mã bị khóa.`,
    };
  }

  // Verified successfully! Remove used PIN
  activePins.delete(cleanEmail);
  return {
    success: true,
    message: "Xác thực mã PIN thành công! Email đã được xác minh chính chủ.",
    record,
  };
}

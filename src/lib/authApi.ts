import { UserProfile } from '../types';

export interface SendPinResult {
  success: boolean;
  message: string;
  emailSent: boolean;
  sendMethod: string;
  cooldownSeconds?: number;
  devPin?: string;
}

export interface VerifyPinResult {
  success: boolean;
  message: string;
  record?: {
    email: string;
    purpose: 'signup' | 'signin';
    name?: string;
  };
}

/**
 * Request a 6-digit verification PIN to be sent to user's email
 */
export async function requestEmailPin(params: {
  email: string;
  purpose: 'signup' | 'signin';
  name?: string;
}): Promise<SendPinResult> {
  try {
    const res = await fetch('/api/auth/send-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      return {
        success: false,
        message: data?.message || `Không thể gửi mã PIN (Lỗi ${res.status}). Vui lòng thử lại.`,
        emailSent: false,
        sendMethod: 'error',
      };
    }

    return data as SendPinResult;
  } catch (err: any) {
    return {
      success: false,
      message: 'Lỗi kết nối đến máy chủ gửi mã PIN: ' + (err?.message || 'Lỗi mạng'),
      emailSent: false,
      sendMethod: 'network_error',
    };
  }
}

/**
 * Verify a 6-digit PIN code submitted by the user
 */
export async function verifyEmailPin(params: {
  email: string;
  pin: string;
  purpose?: 'signup' | 'signin';
}): Promise<VerifyPinResult> {
  try {
    const res = await fetch('/api/auth/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      return {
        success: false,
        message: data?.message || `Xác thực mã PIN thất bại (Lỗi ${res.status}). Vui lòng thử lại.`,
      };
    }

    return data as VerifyPinResult;
  } catch (err: any) {
    return {
      success: false,
      message: 'Lỗi kết nối máy chủ xác thực: ' + (err?.message || 'Lỗi mạng'),
    };
  }
}

/**
 * Sign in / Register with verified Google account
 */
export async function loginWithGoogleApi(params: {
  email: string;
  name?: string;
  avatar?: string;
  googleId?: string;
}): Promise<{ success: boolean; user?: UserProfile; message?: string }> {
  try {
    const res = await fetch('/api/auth/google-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return {
        success: false,
        message: data?.message || 'Không thể đăng nhập bằng tài khoản Google.',
      };
    }

    return {
      success: true,
      user: data.user,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Lỗi mạng khi kết nối Google: ' + (err?.message || 'Lỗi mạng'),
    };
  }
}

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
  token?: string;
  user?: UserProfile;
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

    if (data.token) {
      saveSessionToken(data.token);
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

const SESSION_TOKEN_KEY = 'ecosort_session_token';
const EVALUATOR_TOKEN_KEY = 'ecosort_evaluator_auth_token';

export function saveSessionToken(token: string) {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch (e) {}
}

export function getSessionToken(): string {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function clearSessionToken() {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch (e) {}
}

export function saveEvaluatorToken(token: string) {
  try {
    sessionStorage.setItem(EVALUATOR_TOKEN_KEY, token);
  } catch (e) {}
}

export function getEvaluatorToken(): string {
  try {
    return sessionStorage.getItem(EVALUATOR_TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function clearEvaluatorToken() {
  try {
    sessionStorage.removeItem(EVALUATOR_TOKEN_KEY);
  } catch (e) {}
}

/**
 * Authenticate evaluator passkey for STEM Lab
 */
export async function evaluatorLoginApi(passkey: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const res = await fetch('/api/auth/evaluator-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkey }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Mã xác thực không chính xác hoặc đã hết hạn.',
      };
    }
    if (data.token) {
      saveEvaluatorToken(data.token);
    }
    return { success: true, token: data.token };
  } catch (err: any) {
    return { success: false, error: 'Lỗi kết nối máy chủ xác thực giám khảo: ' + err.message };
  }
}

/**
 * Check if current session has active evaluator rights
 */
export async function checkEvaluatorAuthApi(): Promise<boolean> {
  const token = getEvaluatorToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/auth/evaluator-check', {
      headers: {
        'x-benchmark-auth': token,
      },
    });
    const data = await res.json().catch(() => null);
    return Boolean(data?.authorized);
  } catch (e) {
    return false;
  }
}


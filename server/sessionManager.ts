import crypto from 'crypto';
import type { Request } from 'express';

export interface UserSession {
  token: string;
  userId: string;
  email?: string;
  name?: string;
  role: 'student' | 'teacher' | 'admin' | 'guest';
  isGuest: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface EvaluatorSession {
  token: string;
  role: 'evaluator' | 'admin';
  createdAt: number;
  expiresAt: number;
}

// In-memory active session stores
const activeUserSessions = new Map<string, UserSession>();
const activeEvaluatorSessions = new Map<string, EvaluatorSession>();

// Idempotency cache for classify requests: idempotencyKey -> cached response
interface IdempotencyRecord {
  key: string;
  response: any;
  timestamp: number;
  userId: string;
}
const idempotencyCache = new Map<string, IdempotencyRecord>();

// Clean up expired sessions periodically
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of activeUserSessions.entries()) {
    if (now > sess.expiresAt) activeUserSessions.delete(token);
  }
  for (const [token, sess] of activeEvaluatorSessions.entries()) {
    if (now > sess.expiresAt) activeEvaluatorSessions.delete(token);
  }
  for (const [key, record] of idempotencyCache.entries()) {
    if (now - record.timestamp > 60 * 1000) idempotencyCache.delete(key);
  }
}, 5 * 60 * 1000);
if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

/**
 * Get or generate ADMIN_SECRET safely.
 * Never defaults to known static credentials like "STEM2026" or "ecosort_admin_2026".
 */
let ephemeralAdminSecret: string | null = null;

export function getAdminSecret(): string {
  const envSecret = (process.env.ADMIN_SECRET || '').trim();
  if (envSecret) return envSecret;

  if (!ephemeralAdminSecret) {
    ephemeralAdminSecret = 'stem_admin_' + crypto.randomBytes(16).toString('hex');
    console.log('\n[EcoSort Security] ⚠️ ADMIN_SECRET is not configured in environment.');
    console.log(`[EcoSort Security] 🔑 Generated ephemeral ADMIN_SECRET for this session: ${ephemeralAdminSecret}\n`);
  }
  return ephemeralAdminSecret;
}

/**
 * Creates a verified user session upon successful login (email PIN or Google)
 */
export function createUserSession(params: {
  userId: string;
  email?: string;
  name?: string;
  role?: 'student' | 'teacher' | 'admin';
}): UserSession {
  const token = 'usess_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const session: UserSession = {
    token,
    userId: params.userId,
    email: params.email,
    name: params.name,
    role: params.role || 'student',
    isGuest: false,
    createdAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  activeUserSessions.set(token, session);
  return session;
}

/**
 * Creates or gets a secure guest session
 */
export function createGuestSession(clientIp: string, customGuestId?: string): UserSession {
  const token = 'gsess_' + crypto.randomBytes(20).toString('hex');
  const now = Date.now();
  const cleanIp = (clientIp || '127.0.0.1').replace(/[^a-zA-Z0-9]/g, '_');
  const guestId = customGuestId && customGuestId.startsWith('guest_')
    ? customGuestId
    : `guest_${cleanIp}_${crypto.randomBytes(4).toString('hex')}`;

  const session: UserSession = {
    token,
    userId: guestId,
    name: 'Khách vãng lai',
    role: 'guest',
    isGuest: true,
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
  };
  activeUserSessions.set(token, session);
  return session;
}

/**
 * Authenticates evaluator / teacher passkey for STEM Lab
 */
export function authenticateEvaluator(passkey: string): {
  success: boolean;
  token?: string;
  error?: string;
} {
  const secret = getAdminSecret();
  if (!passkey || passkey.trim() !== secret) {
    return {
      success: false,
      error: 'Mã xác thực ban giám khảo / giáo viên không chính xác. Vui lòng liên hệ ban tổ chức STEM.',
    };
  }

  const token = 'eval_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const session: EvaluatorSession = {
    token,
    role: 'evaluator',
    createdAt: now,
    expiresAt: now + 12 * 60 * 60 * 1000, // 12 hours
  };
  activeEvaluatorSessions.set(token, session);

  return {
    success: true,
    token,
  };
}

/**
 * Verify whether an evaluator token is valid
 */
export function isEvaluatorAuthorized(tokenOrKey?: string): boolean {
  if (!tokenOrKey) return false;
  const trimmed = tokenOrKey.trim();

  // Direct ADMIN_SECRET match
  const secret = getAdminSecret();
  if (trimmed === secret) return true;

  // Active evaluator session token
  const session = activeEvaluatorSessions.get(trimmed);
  if (session && Date.now() <= session.expiresAt) {
    return true;
  }

  return false;
}

/**
 * Extracts and verifies the user session from the request.
 * Header format: Authorization: Bearer <token> OR x-session-token: <token>
 */
export function getVerifiedUserSession(req: Request): UserSession {
  const authHeader = req.headers.authorization || (req.headers['x-session-token'] as string) || '';
  let token = '';

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    token = authHeader.trim();
  }

  if (token && activeUserSessions.has(token)) {
    const session = activeUserSessions.get(token)!;
    if (Date.now() <= session.expiresAt) {
      return session;
    }
    activeUserSessions.delete(token);
  }

  // Fallback: If no valid session token provided, derive or generate a tamper-proof guest session
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  return createGuestSession(clientIp);
}

/**
 * Check and store idempotency result
 */
export function getIdempotencyResult(key: string, userId: string): any | null {
  if (!key) return null;
  const record = idempotencyCache.get(key);
  if (!record) return null;
  if (record.userId === userId && Date.now() - record.timestamp < 30 * 1000) {
    return record.response;
  }
  return null;
}

export function setIdempotencyResult(key: string, userId: string, response: any): void {
  if (!key) return;
  idempotencyCache.set(key, {
    key,
    response,
    timestamp: Date.now(),
    userId,
  });
}

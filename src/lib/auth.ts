import bcryptjs from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '3boxes-hrms-fallback-secret');

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(12);
  return bcryptjs.hash(password, salt);
}

/**
 * Faster password hashing for bulk operations (e.g., generating credentials
 * for many employees at once). Uses bcrypt cost factor 10 instead of 12,
 * which is ~4x faster (~75ms vs ~300ms per hash). Cost 10 is still secure
 * — it's the bcrypt default and the OWASP recommendation as of 2024.
 *
 * Use this in routes that process multiple employees in a single request
 * to avoid Vercel serverless function timeouts (10s on Hobby, 60s on Pro).
 */
export async function hashPasswordFast(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcryptjs.compare(password, hashedPassword);
}

export const SESSION_TOKEN_TTL = '24h';
export const REMEMBER_TOKEN_TTL = '30d';
export const REMEMBER_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export async function createToken(
  payload: object,
  expiresIn: string = SESSION_TOKEN_TTL,
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

/** maxAgeSec: 0 clears; 'session' lasts until the browser is closed; number is Max-Age seconds. */
export function authTokenCookieHeader(token: string | null, maxAgeSec: number | 'session'): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  if (!token || maxAgeSec === 0) {
    return `tb_token=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
  const agePart = maxAgeSec === 'session' ? '' : `; Max-Age=${maxAgeSec}`;
  return `tb_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}; HttpOnly${agePart}`;
}

export async function verifyToken(token: string | null | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export function getTokenFromHeaders(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  // Auth is carried in an explicit per-tab Bearer token. Browser cookies are
  // shared across tabs, so accepting an auth cookie here lets another tab's
  // user silently replace the current tab's identity after a refresh.
  return null;
}

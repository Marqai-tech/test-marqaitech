import bcryptjs from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '3boxes-hrms-fallback-secret');

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(12);
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

export function authTokenCookieHeader(token: string | null, maxAgeSec: number | null): string {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  if (!token || maxAgeSec === null) {
    return `tb_token=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
  return `tb_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}; HttpOnly`;
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

  // Also check cookies — support both 'token' and 'tb_token' cookie names
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const tbTokenCookie = cookies.find(c => c.startsWith('tb_token='));
    if (tbTokenCookie) {
      return decodeURIComponent(tbTokenCookie.substring('tb_token='.length));
    }
    const tokenCookie = cookies.find(c => c.startsWith('token='));
    if (tokenCookie) {
      return decodeURIComponent(tokenCookie.substring('token='.length));
    }
  }

  return null;
}

// Local auth: scrypt password hashes and HMAC-signed session cookies.
// Local-only; there is no external identity provider on the default path.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_SECRET =
  process.env.PORTAL_SESSION_SECRET ?? "dev-only-session-secret-change-me";
const SESSION_TTL_S = 60 * 60 * 8;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const a = scryptSync(password, salt, 32);
  const b = Buffer.from(hex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function signSession(userId: number, tenantId: number, role: string): string {
  const payload = b64url(
    JSON.stringify({ uid: userId, tid: tenantId, role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S }),
  );
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export interface Session {
  userId: number;
  tenantId: number;
  role: string;
}

export function readSession(cookieHeader: string | undefined): Session | null {
  if (!cookieHeader) return null;
  const m = /(?:^|;\s*)portal_session=([^;]+)/.exec(cookieHeader);
  if (!m) return null;
  const [payload, sig] = m[1]!.split(".");
  if (!payload || !sig) return null;
  const want = createHmac("sha256", SESSION_SECRET).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    return { userId: p.uid, tenantId: p.tid, role: p.role };
  } catch {
    return null;
  }
}

export function sessionCookie(value: string): string {
  return `portal_session=${value}; HttpOnly; Path=/; SameSite=Lax`;
}

export function clearCookie(): string {
  return "portal_session=; HttpOnly; Path=/; Max-Age=0";
}

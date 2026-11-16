/**
 * The admin session: a stateless cookie `v1.<expiry>.<nonce>.<hmac>` signed
 * with HMAC-SHA256 over `ADMIN_SESSION_SECRET`. Rotating the secret logs every
 * session out. Used by the proxy and by every server action.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "admin_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Flags for the session cookie: scoped to the admin path, never sent cross-site. */
export const sessionCookieOptions = (basePath: string) =>
  ({
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: basePath,
    maxAge: SESSION_TTL_SECONDS,
  }) as const;

const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest();

export function signSession(secret: string, now: number = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${exp}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${mac(payload, secret).toString("base64url")}`;
}

/** True for an untampered, unexpired token signed with `secret`. */
export function verifySession(token: string | undefined | null, secret: string, now: number = Date.now()): boolean {
  if (!token || !secret || token.length > 200) return false;
  const m = /^(v1\.(\d{1,12})\.[\w-]{16,32})\.([\w-]{43})$/.exec(token);
  if (!m) return false;
  // Compare the canonical encodings, so the MAC's spare low bits can't vary.
  const given = Buffer.from(m[3], "utf8");
  const expected = Buffer.from(mac(m[1], secret).toString("base64url"), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const exp = Number(m[2]);
  const nowS = Math.floor(now / 1000);
  // Expired, or claiming to outlive the TTL (only a forged token could).
  return exp > nowS && exp <= nowS + SESSION_TTL_SECONDS;
}

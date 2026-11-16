/**
 * Admin password hashing: scrypt from node:crypto, constant-time compare.
 * Format: `scrypt:<N>:<r>:<p>:<salt>:<hash>` with base64url salt and hash (no
 * `$`, so .env files don't try to expand it). `npx gitms hash` makes one.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;
const MAXMEM = 64 * 1024 * 1024;
/** Longer input is refused before hashing (a cheap DoS guard). */
export const MAX_PASSWORD_LENGTH = 1024;

const FORMAT = /^scrypt:(\d{1,7}):(\d{1,2}):(\d{1,2}):([\w-]{16,}):([\w-]{22,})$/;

type Parsed = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

function parse(stored: string): Parsed | null {
  const m = FORMAT.exec(stored);
  if (!m) return null;
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const powerOfTwo = N >= 1024 && N <= 1 << 20 && (N & (N - 1)) === 0;
  if (!powerOfTwo || r < 1 || r > 32 || p < 1 || p > 16) return null;
  const salt = Buffer.from(m[4], "base64url");
  const hash = Buffer.from(m[5], "base64url");
  if (salt.length < 16 || hash.length < 16 || hash.length > 128) return null;
  return { N, r, p, salt, hash };
}

function derive(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, keylen, { ...opts, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export function isPasswordHash(stored: string): boolean {
  return parse(stored) !== null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await derive(password, salt, keylen, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

/** True only for the right password. Never throws: a malformed hash is a mismatch. */
export async function verifyPassword(password: unknown, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed || typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  try {
    const { N, r, p, salt, hash } = parsed;
    const key = await derive(password, salt, hash.length, { N, r, p });
    return timingSafeEqual(key, hash);
  } catch {
    return false;
  }
}

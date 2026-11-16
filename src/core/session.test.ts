// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, sessionCookieOptions, signSession, verifySession } from "./session";

const SECRET = "s".repeat(40);
const NOW = Date.parse("2026-10-12T12:00:00Z");

describe("session tokens (AC4)", () => {
  it("verifies a fresh token", () => {
    expect(verifySession(signSession(SECRET, NOW), SECRET, NOW)).toBe(true);
  });

  it("expires after 12 hours", () => {
    const token = signSession(SECRET, NOW);
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_SECONDS * 1000 - 1000)).toBe(true);
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_SECONDS * 1000)).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = signSession(SECRET, NOW);
    const [v, exp, nonce, mac] = token.split(".");
    const later = `${v}.${Number(exp) + 3600}.${nonce}.${mac}`;
    expect(verifySession(later, SECRET, NOW)).toBe(false);
    const flipped = `${v}.${exp}.${nonce}.${mac.slice(0, 20)}${mac[20] === "A" ? "B" : "A"}${mac.slice(21)}`;
    expect(verifySession(flipped, SECRET, NOW)).toBe(false);
  });

  it("rejects non-canonical encodings of a valid MAC (the last char's spare bits)", () => {
    const token = signSession(SECRET, NOW);
    const last = token.at(-1)!;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    // The 43rd char of a 32-byte MAC holds 4 data bits; its 2 low bits are padding.
    const i = alphabet.indexOf(last);
    const sibling = alphabet[(i & ~3) | ((i + 1) & 3)];
    expect(Buffer.from(token.slice(-43, -1) + sibling, "base64url")).toEqual(Buffer.from(token.slice(-43), "base64url"));
    expect(verifySession(token.slice(0, -1) + sibling, SECRET, NOW)).toBe(false);
    expect(verifySession(`${token}x`, SECRET, NOW)).toBe(false);
  });

  it("rejects a token signed with another secret, or a forged far-future expiry", async () => {
    expect(verifySession(signSession("o".repeat(40), NOW), SECRET, NOW)).toBe(false);
    // Signed with the right secret but claiming a week: only a forger could make it.
    const { createHmac } = await import("node:crypto");
    const payload = `v1.${Math.floor(NOW / 1000) + 7 * 86400}.abcdefghijklmnopqrstuv`;
    const forged = `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
    expect(verifySession(forged, SECRET, NOW)).toBe(false);
  });

  it("rejects empty and junk input", () => {
    for (const t of [undefined, null, "", "v1", "a.b.c.d", "x".repeat(500)]) expect(verifySession(t, SECRET, NOW)).toBe(false);
    expect(verifySession(signSession(SECRET, NOW), "", NOW)).toBe(false);
  });

  it("uses HttpOnly, Secure, SameSite=Strict, Path=/admin and a 12h max age", () => {
    expect(sessionCookieOptions("/admin")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/admin",
      maxAge: 43200,
    });
  });
});

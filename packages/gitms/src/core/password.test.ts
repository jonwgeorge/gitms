// @vitest-environment node
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashPassword, isPasswordHash, verifyPassword } from "./password";

const ROOT = join(__dirname, "..", "..");

describe("password hashing (AC4)", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^scrypt:16384:8:1:[\w-]+:[\w-]+$/);
    expect(hash).not.toContain("$");
    expect(isPasswordHash(hash)).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("treats a malformed hash, non-string or oversized input as a mismatch, never throwing", async () => {
    const hash = await hashPassword("pw-123456789");
    expect(await verifyPassword("pw-123456789", "plain-text")).toBe(false);
    expect(await verifyPassword("pw-123456789", hash.replace("16384", "1000"))).toBe(false);
    expect(await verifyPassword(null, hash)).toBe(false);
    expect(await verifyPassword(new Blob(["x"]), hash)).toBe(false);
    expect(await verifyPassword("x".repeat(5000), hash)).toBe(false);
    expect(isPasswordHash("")).toBe(false);
  });

  it("accepts hashes from `gitms hash` (bin/gitms.mjs)", async () => {
    const out = execFileSync(process.execPath, [join(ROOT, "bin", "gitms.mjs"), "hash"], {
      input: "a long test passphrase\n",
    })
      .toString()
      .trim();
    expect(isPasswordHash(out)).toBe(true);
    expect(await verifyPassword("a long test passphrase", out)).toBe(true);
    expect(await verifyPassword("a long test passphrase\n", out)).toBe(false);
  });

  it("the script refuses a short password", () => {
    expect(() =>
      execFileSync(process.execPath, [join(ROOT, "bin", "gitms.mjs"), "hash"], { input: "short", stdio: "pipe" }),
    ).toThrow();
  });
});

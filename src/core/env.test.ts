import { describe, expect, it } from "vitest";
import { adminConfig } from "./env";

const HASH = "scrypt:16384:8:1:vqW26xOvReRKchX3a-R_XA:LBpgB10TGQqQu3OBgE_bQwcNx9SWCs67c73F47bT2rn5D-1bwjxVQ1WomVa305xTIQX0YqoxGPNFaDdSG2_v3g";
const SECRET = "x".repeat(32);

describe("admin config from env", () => {
  it("reads GITMS_-prefixed names before the legacy ones", () => {
    const c = adminConfig({
      NODE_ENV: "production",
      GITMS_ADMIN_PASSWORD_HASH: HASH,
      ADMIN_PASSWORD_HASH: "junk",
      GITMS_ADMIN_SESSION_SECRET: SECRET,
      GITMS_GITHUB_TOKEN: "t",
      GITHUB_REPO: "octo/site",
      GITMS_GITHUB_BRANCH: "content",
    });
    expect(c).toMatchObject({ configured: true, passwordHash: HASH, store: { kind: "github", token: "t", repo: "octo/site", branch: "content" } });
  });

  it("is not configured with nothing set", () => {
    expect(adminConfig({ NODE_ENV: "production" })).toEqual({
      configured: false,
      missing: ["ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET", "GITHUB_TOKEN", "GITHUB_REPO"],
    });
  });

  it("uses github in production with the token, repo and default branch", () => {
    const c = adminConfig({ NODE_ENV: "production", ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET, GITHUB_TOKEN: "t", GITHUB_REPO: "octo/site" });
    expect(c).toMatchObject({ configured: true, store: { kind: "github", repo: "octo/site", branch: "main" } });
  });

  it("uses fs in development, or when ADMIN_STORE=fs", () => {
    expect(adminConfig({ NODE_ENV: "development", ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET })).toMatchObject({
      configured: true,
      store: { kind: "fs" },
    });
    expect(adminConfig({ NODE_ENV: "production", ADMIN_STORE: "fs", ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET })).toMatchObject({
      store: { kind: "fs" },
    });
  });

  it("defaults to the github store on Workers, even in development", () => {
    expect(adminConfig({ NODE_ENV: "development", ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET }, true)).toEqual({
      configured: false,
      missing: ["GITHUB_TOKEN", "GITHUB_REPO"],
    });
  });

  it("refuses fs on Cloudflare, a short secret, a bad hash, a bad repo or an unknown store", () => {
    expect(adminConfig({ ADMIN_STORE: "fs", ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET }, true)).toEqual({
      configured: false,
      missing: ["ADMIN_STORE (fs is not available on Cloudflare)"],
    });
    expect(adminConfig({ NODE_ENV: "development", ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: "short" })).toMatchObject({
      configured: false,
      missing: ["ADMIN_SESSION_SECRET"],
    });
    expect(adminConfig({ NODE_ENV: "development", ADMIN_PASSWORD_HASH: "hunter2", ADMIN_SESSION_SECRET: SECRET })).toMatchObject({
      missing: ["ADMIN_PASSWORD_HASH"],
    });
    expect(adminConfig({ ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET, GITHUB_TOKEN: "t", GITHUB_REPO: "../x" })).toMatchObject({
      missing: ["GITHUB_REPO"],
    });
    expect(adminConfig({ ADMIN_STORE: "s3", ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET })).toMatchObject({
      missing: ["ADMIN_STORE (github or fs)"],
    });
  });
});

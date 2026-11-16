/**
 * Admin secrets from the environment. If anything is missing the admin is
 * "not configured": pages say so, login and saves refuse. Server-only.
 *
 * Each variable is read as `GITMS_<NAME>` first, then as the bare legacy name
 * (`ADMIN_PASSWORD_HASH`, `GITHUB_TOKEN`, …), so existing deployments keep working.
 */
import { isPasswordHash } from "./password";

type Env = Record<string, string | undefined>;

export type StoreConfig =
  | { readonly kind: "github"; readonly token: string; readonly repo: string; readonly branch: string }
  | { readonly kind: "fs"; readonly root: string };

export type AdminConfig =
  | {
      readonly configured: true;
      readonly passwordHash: string;
      readonly sessionSecret: string;
      readonly store: StoreConfig;
    }
  | { readonly configured: false; readonly missing: readonly string[] };

export const MIN_SECRET_LENGTH = 32;
/** `owner/name` as GitHub allows it; no `.`/`..` segments. */
export const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.\.?$)[\w.-]{1,100}$/;

/** True inside the Cloudflare Workers runtime (production on Cloudflare). */
export function onWorkers(): boolean {
  return globalThis.navigator?.userAgent === "Cloudflare-Workers";
}

/** The variables gitms reads, by their legacy names. */
export const ENV_NAMES = ["ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET", "ADMIN_STORE", "GITHUB_TOKEN", "GITHUB_REPO", "GITHUB_BRANCH"] as const;
type EnvName = (typeof ENV_NAMES)[number];

/** `GITMS_ADMIN_PASSWORD_HASH`, then `ADMIN_PASSWORD_HASH`; trimmed, "" when unset. */
export const readEnv = (env: Env, name: EnvName) => (env[`GITMS_${name}`]?.trim() || env[name]?.trim()) ?? "";

export function adminConfig(env: Env = process.env, workers: boolean = onWorkers()): AdminConfig {
  const missing: string[] = [];
  const passwordHash = readEnv(env, "ADMIN_PASSWORD_HASH");
  const sessionSecret = readEnv(env, "ADMIN_SESSION_SECRET");
  if (!isPasswordHash(passwordHash)) missing.push("ADMIN_PASSWORD_HASH");
  if (sessionSecret.length < MIN_SECRET_LENGTH) missing.push("ADMIN_SESSION_SECRET");

  // fs by default only in local `next dev`; on Workers (even `wrangler dev`) saves go to GitHub.
  const kind = readEnv(env, "ADMIN_STORE") || (env.NODE_ENV === "development" && !workers ? "fs" : "github");
  let store: StoreConfig | null = null;
  if (kind === "fs") {
    // Workers have no writable filesystem; saves there would fail or vanish.
    if (workers) missing.push("ADMIN_STORE (fs is not available on Cloudflare)");
    else store = { kind: "fs", root: process.cwd() };
  } else if (kind === "github") {
    const token = readEnv(env, "GITHUB_TOKEN");
    const repo = readEnv(env, "GITHUB_REPO");
    const branch = readEnv(env, "GITHUB_BRANCH") || "main";
    if (!token) missing.push("GITHUB_TOKEN");
    if (!REPO_PATTERN.test(repo)) missing.push("GITHUB_REPO");
    if (!/^[\w][\w./-]{0,99}$/.test(branch) || branch.includes("..")) missing.push("GITHUB_BRANCH");
    if (!missing.some((m) => m.startsWith("GITHUB_"))) store = { kind: "github", token, repo, branch };
  } else {
    missing.push("ADMIN_STORE (github or fs)");
  }

  if (missing.length || !store) return { configured: false, missing };
  return { configured: true, passwordHash, sessionSecret, store };
}

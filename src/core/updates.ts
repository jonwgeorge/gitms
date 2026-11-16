/**
 * Is there a newer gitms? Sites install gitms from GitHub (`#main`), and the
 * lockfile pins the exact commit. `withGitms()` reads that commit at build
 * time and bakes it in as `GITMS_INSTALLED_COMMIT`; the admin compares it with
 * the newest commit on gitms's `main` and offers to update now (by sending the
 * site's own repo the `gitms-updated` event its update workflow listens for).
 * Without a click, that workflow's daily run updates the site anyway.
 * Server-only.
 */
import { REPO_PATTERN, type StoreConfig } from "./env";

/** Where gitms itself lives: what sites install and compare against. */
export const GITMS_SOURCE = { repo: "jonwgeorge/gitms", branch: "main" } as const;

/** How long a check is reused before GitHub is asked again (a failed one for less). */
export const CHECK_TTL_MS = 60 * 60 * 1000;
export const ERROR_TTL_MS = 5 * 60 * 1000;

const SHA = /^[0-9a-f]{40}$/;
const API = "https://api.github.com";

/** One gitms change the site doesn't have yet. */
export type Change = { readonly sha: string; readonly message: string; readonly url: string };

export type UpdateStatus =
  | {
      readonly state: "current" | "available";
      readonly installed: string;
      readonly latest: string;
      /** Commits on main the site doesn't have. */
      readonly behind: number;
      /** The newest of those, newest first (at most MAX_CHANGES). */
      readonly changes: readonly Change[];
      readonly checkedAt: string;
    }
  | {
      /** The installed commit isn't known (gitms linked locally, or not built with withGitms). */
      readonly state: "unknown";
      readonly installed: string | null;
      readonly latest: string;
      readonly checkedAt: string;
    }
  | { readonly state: "error"; readonly message: string; readonly checkedAt: string };

export const MAX_CHANGES = 5;

/** The gitms commit a lockfile pins (`…gitms.git#<sha>`), or null. */
export function commitFromLock(lock: unknown): string | null {
  const packages = (lock as { packages?: Record<string, { resolved?: unknown }> } | null)?.packages;
  const resolved = packages?.["node_modules/gitms"]?.resolved;
  if (typeof resolved !== "string") return null;
  const sha = resolved.slice(resolved.lastIndexOf("#") + 1);
  return resolved.includes("#") && SHA.test(sha) ? sha : null;
}

/** The commit this build runs, as `withGitms()` baked it in; null when unknown. */
export function installedCommit(): string | null {
  // Written out in full so Next inlines it at build time.
  const sha = process.env.GITMS_INSTALLED_COMMIT?.trim() ?? "";
  return SHA.test(sha) ? sha : null;
}

const firstLine = (message: unknown) => (typeof message === "string" ? message.split("\n")[0].slice(0, 200) : "");

type CheckOptions = {
  readonly installed: string | null;
  /** Only needed if the gitms repository is private: a token that can read it. */
  readonly token?: string;
  readonly userAgent?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
};

/** Asks GitHub how far the installed commit is behind gitms's main. Never throws. */
export async function checkForUpdate({ installed, token, userAgent = "gitms", fetch: fetchImpl = fetch, now = () => new Date() }: CheckOptions): Promise<UpdateStatus> {
  const checkedAt = now().toISOString();
  const { repo, branch } = GITMS_SOURCE;
  const get = async (path: string) => {
    return fetchImpl(`${API}/repos/${repo}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": userAgent,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });
  };
  const failed = (status: number) => {
    const message =
      status === 404 || status === 401
        ? "Couldn't read the gitms repository. If it's private, set GITMS_SOURCE_TOKEN to a token that can read it."
        : status === 403 || status === 429
          ? "GitHub is rate limiting update checks. Try again later."
          : `GitHub returned ${status} checking for updates.`;
    return { state: "error" as const, message, checkedAt };
  };

  /** Just the newest commit on main, when there's nothing to compare with. */
  const latestOnly = async (): Promise<UpdateStatus> => {
    const res = await get(`/commits/${branch}`);
    if (!res.ok) return failed(res.status);
    const body = (await res.json()) as { sha?: unknown };
    if (typeof body.sha !== "string" || !SHA.test(body.sha)) return { state: "error", message: "Unexpected GitHub response checking for updates.", checkedAt };
    return { state: "unknown", installed, latest: body.sha, checkedAt };
  };

  try {
    if (!installed) return await latestOnly();
    const res = await get(`/compare/${installed}...${branch}`);
    // 404: the installed commit isn't in gitms (a fork, or a rewritten branch), or the repo can't be read.
    if (res.status === 404) return await latestOnly();
    if (!res.ok) return failed(res.status);
    const body = (await res.json()) as { status?: unknown; ahead_by?: unknown; commits?: unknown };
    const commits = (Array.isArray(body.commits) ? body.commits : []) as { sha?: unknown; html_url?: unknown; commit?: { message?: unknown } }[];
    const ahead = typeof body.ahead_by === "number" ? body.ahead_by : 0;
    const latestSha = commits.length ? commits[commits.length - 1].sha : installed;
    const latest = typeof latestSha === "string" && SHA.test(latestSha) ? latestSha : installed;
    // "ahead": main has commits the site lacks. "identical"/"behind": nothing newer on main.
    // "diverged": the site runs a branch; still offer main's newer commits.
    if (ahead === 0 || body.status === "identical" || body.status === "behind") {
      return { state: "current", installed, latest: installed, behind: 0, changes: [], checkedAt };
    }
    const changes = commits
      .slice(-MAX_CHANGES)
      .reverse()
      .flatMap((c) =>
        typeof c.sha === "string" && SHA.test(c.sha)
          ? [{ sha: c.sha, message: firstLine(c.commit?.message), url: `https://github.com/${repo}/commit/${c.sha}` }]
          : [],
      );
    return { state: "available", installed, latest, behind: ahead, changes, checkedAt };
  } catch {
    return { state: "error", message: "Couldn't reach GitHub to check for updates.", checkedAt };
  }
}

/* ---------- cached check, per server instance ---------- */

let cached: { at: number; key: string; status: UpdateStatus } | null = null;

/** The update status, reusing a check younger than CHECK_TTL_MS unless `fresh`. */
export async function updateStatus(options: CheckOptions & { readonly fresh?: boolean; readonly clock?: () => number }): Promise<UpdateStatus> {
  const clock = options.clock ?? Date.now;
  const key = options.installed ?? "";
  const ttl = cached?.status.state === "error" ? ERROR_TTL_MS : CHECK_TTL_MS;
  if (!options.fresh && cached && cached.key === key && clock() - cached.at < ttl) return cached.status;
  const status = await checkForUpdate(options);
  cached = { at: clock(), key, status };
  return status;
}

/** Forgets the cached check (after an update is requested, and in tests). */
export function clearUpdateCache(): void {
  cached = null;
}

/**
 * The token for update checks: `GITMS_SOURCE_TOKEN` if set (needed when gitms
 * is private), else the content store's GitHub token. Any token can read a
 * public repository, and an authenticated check isn't caught by the low
 * per-IP limit GitHub puts on anonymous calls (hosts share their IPs).
 */
export function sourceToken(store: StoreConfig | null, env: Record<string, string | undefined> = process.env): string | undefined {
  return env.GITMS_SOURCE_TOKEN?.trim() || (store?.kind === "github" ? store.token : undefined);
}

/* ---------- update now ---------- */

/** Why an update couldn't be started; the admin words each one (never from the URL). */
export type UpdateFailure = "repo" | "unreachable" | "denied" | "failed";
export type UpdateRequest = { readonly ok: true } | { readonly ok: false; readonly code: UpdateFailure };

type RequestOptions = {
  /** The site's repo and token (the GitHub store's), which can send it events. */
  readonly repo: string;
  readonly token: string;
  readonly sha?: string | null;
  readonly userAgent?: string;
  readonly fetch?: typeof fetch;
};

/**
 * Sends the site's repo the `gitms-updated` event, which starts its "Update
 * gitms" workflow (templates/update-gitms.yml). The store's token already has
 * Contents: write, which is what GitHub asks for to send the event.
 */
export async function requestUpdate({ repo, token, sha, userAgent = "gitms", fetch: fetchImpl = fetch }: RequestOptions): Promise<UpdateRequest> {
  if (!REPO_PATTERN.test(repo)) return { ok: false, code: "repo" };
  let res: Response;
  try {
    res = await fetchImpl(`${API}/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": userAgent,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "gitms-updated", client_payload: { sha: sha && SHA.test(sha) ? sha : null, from: "admin" } }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  if (res.ok) return { ok: true };
  return { ok: false, code: res.status === 403 || res.status === 404 ? "denied" : "failed" };
}

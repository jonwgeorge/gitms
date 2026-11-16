// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_TTL_MS, ERROR_TTL_MS, MAX_CHANGES, checkForUpdate, clearUpdateCache, commitFromLock, installedCommit, requestUpdate, sourceToken, updateStatus } from "./updates";

const A = "a".repeat(40);
const B = "b".repeat(40);
const sha = (n: number) => n.toString(16).padStart(40, "0");
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const now = () => new Date("2026-11-16T12:00:00Z");

afterEach(() => {
  clearUpdateCache();
  vi.unstubAllEnvs();
});

describe("commitFromLock", () => {
  it("reads the commit npm pinned for a GitHub install", () => {
    expect(commitFromLock({ packages: { "node_modules/gitms": { resolved: `git+ssh://git@github.com/jonwgeorge/gitms.git#${A}` } } })).toBe(A);
  });
  it("is null for a linked workspace, a missing lockfile entry or junk", () => {
    expect(commitFromLock({ packages: { "node_modules/gitms": { resolved: "", link: true } } })).toBeNull();
    expect(commitFromLock({ packages: {} })).toBeNull();
    expect(commitFromLock(null)).toBeNull();
    expect(commitFromLock({ packages: { "node_modules/gitms": { resolved: "git+ssh://x#main" } } })).toBeNull();
  });
});

describe("installedCommit", () => {
  it("takes only a full sha from the build", () => {
    vi.stubEnv("GITMS_INSTALLED_COMMIT", A);
    expect(installedCommit()).toBe(A);
    vi.stubEnv("GITMS_INSTALLED_COMMIT", "main");
    expect(installedCommit()).toBeNull();
  });
});

describe("checkForUpdate", () => {
  it("reports newer commits on main, newest first, capped", async () => {
    const commits = Array.from({ length: 7 }, (_, i) => ({ sha: sha(i + 1), commit: { message: `Change ${i + 1}\n\nbody` } }));
    const fetch = vi.fn(async (_url: string | URL | Request) => json(200, { status: "ahead", ahead_by: 7, commits }));
    const status = await checkForUpdate({ installed: A, fetch: fetch as typeof globalThis.fetch, now });
    expect(String(fetch.mock.calls[0][0])).toBe(`https://api.github.com/repos/jonwgeorge/gitms/compare/${A}...main`);
    expect(status).toMatchObject({ state: "available", installed: A, latest: sha(7), behind: 7, checkedAt: "2026-11-16T12:00:00.000Z" });
    if (status.state !== "available") throw new Error();
    expect(status.changes).toHaveLength(MAX_CHANGES);
    expect(status.changes[0]).toEqual({ sha: sha(7), message: "Change 7", url: `https://github.com/jonwgeorge/gitms/commit/${sha(7)}` });
  });

  it("is current when main has nothing newer", async () => {
    const fetch = vi.fn(async () => json(200, { status: "identical", ahead_by: 0, commits: [] }));
    expect(await checkForUpdate({ installed: A, fetch, now })).toMatchObject({ state: "current", behind: 0, changes: [] });
  });

  it("only looks up main's newest commit when the installed one is unknown or not in gitms", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => (String(url).includes("/compare/") ? json(404, {}) : json(200, { sha: B })));
    expect(await checkForUpdate({ installed: null, fetch, now })).toMatchObject({ state: "unknown", installed: null, latest: B });
    expect(await checkForUpdate({ installed: A, fetch, now })).toMatchObject({ state: "unknown", installed: A, latest: B });
  });

  it("explains failures without throwing, and sends the token only when given", async () => {
    const notFound = vi.fn(async () => json(404, {}));
    expect(await checkForUpdate({ installed: null, fetch: notFound, now })).toMatchObject({ state: "error", message: expect.stringMatching(/GITMS_SOURCE_TOKEN/) });
    expect(await checkForUpdate({ installed: null, fetch: vi.fn(async () => json(403, {})), now })).toMatchObject({ state: "error", message: expect.stringMatching(/rate limiting/) });
    expect(await checkForUpdate({ installed: null, fetch: vi.fn(async () => Promise.reject(new Error("offline"))), now })).toMatchObject({ state: "error", message: expect.stringMatching(/reach GitHub/) });

    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(200, { sha: B }));
    await checkForUpdate({ installed: null, fetch: fetch as typeof globalThis.fetch, token: "t0k" });
    expect((fetch.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer t0k");
    await checkForUpdate({ installed: null, fetch: fetch as typeof globalThis.fetch });
    expect((fetch.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("updateStatus", () => {
  it("reuses a check for an hour (a failed one for minutes), and asks again when fresh", async () => {
    let t = 0;
    const clock = () => t;
    const fetch = vi.fn(async () => json(200, { status: "identical", ahead_by: 0, commits: [] }));
    await updateStatus({ installed: A, fetch, clock });
    t = CHECK_TTL_MS - 1;
    await updateStatus({ installed: A, fetch, clock });
    expect(fetch).toHaveBeenCalledTimes(1);
    await updateStatus({ installed: A, fetch, clock, fresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    t += CHECK_TTL_MS;
    await updateStatus({ installed: A, fetch, clock });
    expect(fetch).toHaveBeenCalledTimes(3);

    const failing = vi.fn(async () => json(500, {}));
    await updateStatus({ installed: A, fetch: failing, clock, fresh: true });
    t += ERROR_TTL_MS;
    await updateStatus({ installed: A, fetch: failing, clock });
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe("sourceToken", () => {
  it("prefers GITMS_SOURCE_TOKEN, else the GitHub store's token", () => {
    const github = { kind: "github", token: "store", repo: "me/site", branch: "main" } as const;
    expect(sourceToken(github, { GITMS_SOURCE_TOKEN: " src " })).toBe("src");
    expect(sourceToken(github, {})).toBe("store");
    expect(sourceToken({ kind: "fs", root: "/" }, {})).toBeUndefined();
  });
});

describe("requestUpdate", () => {
  it("sends the site's repo the gitms-updated event", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
    expect(await requestUpdate({ repo: "me/site", token: "tok", sha: B, fetch: fetch as typeof globalThis.fetch })).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/me/site/dispatches");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ event_type: "gitms-updated", client_payload: { sha: B, from: "admin" } });
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("names why it couldn't start", async () => {
    expect(await requestUpdate({ repo: "nope", token: "t" })).toEqual({ ok: false, code: "repo" });
    expect(await requestUpdate({ repo: "me/site", token: "t", fetch: vi.fn(async () => new Response(null, { status: 403 })) })).toEqual({ ok: false, code: "denied" });
    expect(await requestUpdate({ repo: "me/site", token: "t", fetch: vi.fn(async () => new Response(null, { status: 500 })) })).toEqual({ ok: false, code: "failed" });
    expect(await requestUpdate({ repo: "me/site", token: "t", fetch: vi.fn(async () => Promise.reject(new Error())) })).toEqual({ ok: false, code: "unreachable" });
  });
});

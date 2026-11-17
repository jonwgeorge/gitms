/**
 * Where admin saves go. `github` commits through the Contents API (production:
 * your host's git deploy then rebuilds the site); `fs` writes the local files
 * (dev). Both only ever touch the content files the config names, validate
 * before writing and refuse a stale edit by comparing the file's blob sha.
 * Server-only: the GitHub token never leaves this module.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ZodType } from "zod";
import type { ResolvedConfig } from "../config";
import { REPO_PATTERN, type StoreConfig } from "./env";
import { activityFileSchema } from "./activity";
import { schemasFor } from "./schema";

/** A content file by key: "posts", "pages", "redirects", "activity", or one of `config.files`. */
export type ContentFile = string;

type Spec = { readonly path: string; readonly schema: ZodType };

/** Every content file the config names, by key. */
export function contentFiles(cms: ResolvedConfig): Readonly<Record<string, Spec>> {
  const s = schemasFor(cms);
  const out: Record<string, Spec> = {};
  if (cms.posts && s.posts) out.posts = { path: cms.posts.file, schema: s.posts };
  if (cms.pages && s.pages) out.pages = { path: cms.pages.file, schema: s.pages };
  if (cms.redirects) out.redirects = { path: cms.redirects.file, schema: s.redirects };
  if (cms.activity) out.activity = { path: cms.activity.file, schema: activityFileSchema };
  for (const [key, f] of Object.entries(cms.files)) out[key] = { path: f.path, schema: f.schema };
  return out;
}

export type Snapshot = { readonly data: unknown; readonly sha: string };
export type Saved = { readonly sha: string; readonly commitSha: string | null; readonly commitUrl: string | null };
export type LastCommit = { readonly message: string; readonly date: string | null; readonly url: string | null };
/** One commit that touched a content file, newest first in a history list. */
export type Revision = { readonly sha: string; readonly message: string; readonly date: string | null; readonly url: string | null };

/** A full commit sha, the only ref `readAt` accepts. */
export const COMMIT_SHA = /^[0-9a-f]{40}$/;

export interface ContentStore {
  readonly kind: "github" | "fs";
  /** Where saves go, for display: `owner/repo@branch` or `local files`. */
  readonly target: string;
  read(file: ContentFile): Promise<Snapshot>;
  /** Writes validated `data` if the file is still at `sha`; throws StaleContentError otherwise. */
  write(file: ContentFile, data: unknown, opts: { sha: string; message: string }): Promise<Saved>;
  lastCommit(): Promise<LastCommit | null>;
  /** Up to `limit` commits that changed `file`, newest first (empty for the fs store, which has no history). */
  history(file: ContentFile, limit: number): Promise<Revision[]>;
  /** The parsed file as it was at `commit` (a full sha). */
  readAt(file: ContentFile, commit: string): Promise<unknown>;
}

export const STALE_MESSAGE = "Content changed since you opened this page. Reload to get the latest version, then redo your edit.";

export class StaleContentError extends Error {
  constructor() {
    super(STALE_MESSAGE);
    this.name = "StaleContentError";
  }
}

/** A store failure safe to show the admin (never includes the token or a response body). */
export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

export function serialize(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Git's blob sha1, the same value the GitHub Contents API reports as `sha`. */
export function blobSha(text: string): string {
  const body = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}



/** The deepest folder holding every path (`content` for content/a.json and content/b.json), or "" for the repo root. */
export function commonDir(paths: readonly string[]): string {
  if (paths.length === 0) return "";
  const dirs = paths.map((p) => p.split("/").slice(0, -1));
  const out: string[] = [];
  for (let i = 0; dirs.every((d) => i < d.length && d[i] === dirs[0][i]); i++) out.push(dirs[0][i]);
  return out.join("/");
}

/** The file's path and schema; unknown keys are refused. */
function specOf(files: Readonly<Record<string, Spec>>, file: ContentFile): Spec {
  if (!Object.hasOwn(files, file)) throw new StoreError("Unknown content file");
  return files[file];
}

/** Validates against the file's schema and returns the exact text to store. */
function render(spec: Spec, data: unknown): string {
  const result = spec.schema.safeParse(data);
  if (!result.success) throw new StoreError(`Refusing to save invalid ${spec.path}`);
  return serialize(result.data);
}

/* ---------- fs (dev) ---------- */

export function fsStore(root: string, files: Readonly<Record<string, Spec>>): ContentStore {
  const pathOf = (file: ContentFile) => specOf(files, file).path;
  // fs is the dev store only; don't let the bundler trace the whole project for it.
  const abs = (file: ContentFile) => join(/*turbopackIgnore: true*/ root, pathOf(file));
  const readText = async (file: ContentFile) => {
    try {
      return await readFile(abs(file), "utf8");
    } catch {
      throw new StoreError(`Could not read ${pathOf(file)}`);
    }
  };
  return {
    kind: "fs",
    target: "local files",
    async read(file) {
      const text = await readText(file);
      try {
        return { data: JSON.parse(text), sha: blobSha(text) };
      } catch {
        throw new StoreError(`${pathOf(file)} is not valid JSON`);
      }
    },
    async write(file, data, { sha }) {
      const text = render(specOf(files, file), data);
      if (blobSha(await readText(file)) !== sha) throw new StaleContentError();
      const target = abs(file);
      const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(tmp, text, "utf8");
      await rename(tmp, target);
      return { sha: blobSha(text), commitSha: null, commitUrl: null };
    },
    async lastCommit() {
      const times = await Promise.all(
        Object.keys(files).map((f) => stat(abs(f)).then((s) => s.mtime, () => null)),
      );
      const latest = times.filter((t): t is Date => t !== null).sort((a, b) => b.getTime() - a.getTime())[0];
      return latest ? { message: "Local file write (fs store, no commit)", date: latest.toISOString(), url: null } : null;
    },
    async history() {
      return [];
    },
    async readAt(file) {
      throw new StoreError(`Version history needs the GitHub store; the local fs store keeps no history of ${pathOf(file)}`);
    },
  };
}

/* ---------- github (production) ---------- */

export type GithubOptions = {
  files: Readonly<Record<string, Spec>>;
  userAgent?: string;
  token: string;
  /** `owner/name`. */
  repo: string;
  branch: string;
  fetch?: typeof fetch;
};

const API = "https://api.github.com";
/** Only GitHub links are rendered as commit links. */
const githubLink = (url: unknown) => (typeof url === "string" && url.startsWith("https://github.com/") ? url : null);

export function githubStore({ files, userAgent = "gitms", token, repo, branch, fetch: fetchImpl = fetch }: GithubOptions): ContentStore {
  const pathOf = (file: ContentFile) => specOf(files, file).path;
  if (!REPO_PATTERN.test(repo)) throw new StoreError("GITHUB_REPO must look like owner/name");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": userAgent,
  };
  const contentsUrl = (file: ContentFile) => `${API}/repos/${repo}/contents/${pathOf(file)}`;
  const call = async (url: string, init: RequestInit = {}) => {
    try {
      return await fetchImpl(url, { ...init, headers: { ...headers, ...init.headers }, cache: "no-store" });
    } catch {
      throw new StoreError("Could not reach GitHub");
    }
  };

  /** A file at a branch or commit: its parsed JSON and blob sha. */
  const readRef = async (file: ContentFile, ref: string): Promise<Snapshot> => {
    const res = await call(`${contentsUrl(file)}?ref=${encodeURIComponent(ref)}`);
    if (!res.ok) throw new StoreError(`GitHub returned ${res.status} reading ${pathOf(file)}`);
    const body = (await res.json()) as { content?: unknown; sha?: unknown; encoding?: unknown };
    if (typeof body.content !== "string" || typeof body.sha !== "string" || body.encoding !== "base64") {
      throw new StoreError(`Unexpected GitHub response for ${pathOf(file)}`);
    }
    const text = Buffer.from(body.content.replace(/\s/g, ""), "base64").toString("utf8");
    try {
      return { data: JSON.parse(text), sha: body.sha };
    } catch {
      throw new StoreError(`${pathOf(file)} is not valid JSON`);
    }
  };

  return {
    kind: "github",
    target: `${repo}@${branch}`,
    read: (file) => readRef(file, branch),
    async write(file, data, { sha, message }) {
      const text = render(specOf(files, file), data);
      const res = await call(contentsUrl(file), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, content: Buffer.from(text, "utf8").toString("base64"), sha, branch }),
      });
      // 409: the branch moved on; 422: the sha we sent is no longer the file's sha.
      if (res.status === 409 || res.status === 422) throw new StaleContentError();
      if (!res.ok) throw new StoreError(`GitHub returned ${res.status} saving ${pathOf(file)}`);
      const body = (await res.json()) as { content?: { sha?: string }; commit?: { sha?: string; html_url?: string } };
      return {
        sha: body.content?.sha ?? blobSha(text),
        commitSha: body.commit?.sha ?? null,
        commitUrl: githubLink(body.commit?.html_url),
      };
    },
    async lastCommit() {
      const dir = commonDir(Object.values(files).map((f) => f.path));
      const res = await call(`${API}/repos/${repo}/commits?${dir ? `path=${encodeURIComponent(dir)}&` : ""}sha=${encodeURIComponent(branch)}&per_page=1`);
      if (!res.ok) throw new StoreError(`GitHub returned ${res.status} listing commits`);
      const [c] = (await res.json()) as { html_url?: string; commit?: { message?: string; author?: { date?: string } } }[];
      if (!c) return null;
      return { message: c.commit?.message?.split("\n")[0] ?? "", date: c.commit?.author?.date ?? null, url: githubLink(c.html_url) };
    },
    async history(file, limit) {
      const n = Math.max(1, Math.min(100, Math.floor(limit)));
      const res = await call(`${API}/repos/${repo}/commits?path=${encodeURIComponent(pathOf(file))}&sha=${encodeURIComponent(branch)}&per_page=${n}`);
      if (!res.ok) throw new StoreError(`GitHub returned ${res.status} listing the history of ${pathOf(file)}`);
      const list = (await res.json()) as { sha?: unknown; html_url?: unknown; commit?: { message?: string; author?: { date?: string } } }[];
      if (!Array.isArray(list)) throw new StoreError(`Unexpected GitHub response for the history of ${pathOf(file)}`);
      return list
        .filter((c): c is typeof c & { sha: string } => typeof c?.sha === "string" && COMMIT_SHA.test(c.sha))
        .map((c) => ({ sha: c.sha, message: c.commit?.message?.split("\n")[0] ?? "", date: c.commit?.author?.date ?? null, url: githubLink(c.html_url) }));
    },
    async readAt(file, commit) {
      if (!COMMIT_SHA.test(commit)) throw new StoreError("Not a commit sha");
      return (await readRef(file, commit)).data;
    },
  };
}

/** The store the environment selects, over the content files the config names. */
export function createStore(cms: ResolvedConfig, config: StoreConfig): ContentStore {
  const files = contentFiles(cms);
  return config.kind === "github"
    ? githubStore({ files, userAgent: cms.userAgent, token: config.token, repo: config.repo, branch: config.branch })
    : fsStore(config.root, files);
}

/** Runs a store read for a page; store failures become a message instead of a crash. */
export async function attempt<T>(read: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string | null }> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, message: error instanceof StoreError ? error.message : null };
  }
}

/**
 * Image uploads for the post and page editors. An image is committed to the
 * repo under `<uploads.dir>/<yyyy>/<mm>/` (the `github` store) or written
 * there locally (the `fs` store), and served as a static file after
 * the next deploy, the same way content saves go live. Server-only: the
 * GitHub token never leaves this module.
 *
 * Only raster formats whose bytes we can recognise are accepted (PNG, JPEG,
 * GIF, WebP, AVIF). SVG is refused, since it can carry script.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { REPO_PATTERN, type StoreConfig } from "./env";

/** Where uploads go: a folder under public/ and the URL path it is served at. */
export type UploadTarget = { readonly dir: string; readonly publicPath: string };

export type ImageType = { readonly ext: "png" | "jpg" | "gif" | "webp" | "avif"; readonly mime: string };

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

/** The image type from the file's first bytes, or null if it isn't one we accept. */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return { ext: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { ext: "gif", mime: "image/gif" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (ascii(bytes, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 12))) return { ext: "avif", mime: "image/avif" };
  return null;
}

/** Git's blob sha1 of raw bytes (what GitHub reports as a file's `sha`). */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** A safe file stem from the uploaded name: lower-case letters, digits and dashes. */
export function fileStem(name: string): string {
  const base = name.replace(/\.[^.]*$/, "");
  const stem = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return stem || "image";
}

/**
 * Where an image goes: `<dir>/2026/11/<stem>-<hash>.<ext>`. The name
 * carries a hash of the bytes, so the same file uploaded twice lands on the
 * same path and two different files never collide.
 */
export function uploadPath(target: UploadTarget, name: string, bytes: Uint8Array, type: ImageType, when: Date = new Date()): { path: string; url: string } {
  const yyyy = String(when.getUTCFullYear());
  const mm = String(when.getUTCMonth() + 1).padStart(2, "0");
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const rel = `${yyyy}/${mm}/${fileStem(name)}-${hash}.${type.ext}`;
  return { path: `${target.dir}/${rel}`, url: `${target.publicPath}/${rel}` };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const safePath = (dir: string) => new RegExp(`^${escape(dir)}\\/\\d{4}\\/\\d{2}\\/[a-z0-9-]{1,60}\\.(png|jpg|gif|webp|avif)$`);

/** Markdown alt text: one line, no brackets that would end it early. */
export function altText(raw: string, fallback: string): string {
  const alt = raw.replace(/[\r\n\t]+/g, " ").replace(/[[\]]/g, "").trim().slice(0, 200);
  return alt || fallback.replace(/-/g, " ");
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type Uploaded = { readonly commitSha: string | null; readonly commitUrl: string | null; readonly existed: boolean };

export interface UploadStore {
  readonly kind: "github" | "fs";
  /** Writes the file unless the same bytes are already there. */
  put(path: string, bytes: Uint8Array, message: string): Promise<Uploaded>;
}

const pathChecker = (dir: string) => {
  const re = safePath(dir);
  return (path: string) => {
    if (!re.test(path)) throw new UploadError(`Refusing to write outside ${dir}`);
  };
};

export function fsUploads(root: string, dir: string): UploadStore {
  const checkPath = pathChecker(dir);
  return {
    kind: "fs",
    async put(path, bytes) {
      checkPath(path);
      const target = join(/*turbopackIgnore: true*/ root, path);
      const existing = await readFile(target).catch(() => null);
      if (existing && gitBlobSha(existing) === gitBlobSha(bytes)) return { commitSha: null, commitUrl: null, existed: true };
      await mkdir(dirname(target), { recursive: true });
      const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, target);
      return { commitSha: null, commitUrl: null, existed: false };
    },
  };
}

const API = "https://api.github.com";
const githubLink = (url: unknown) => (typeof url === "string" && url.startsWith("https://github.com/") ? url : null);

export function githubUploads({
  dir,
  userAgent = "gitms",
  token,
  repo,
  branch,
  fetch: fetchImpl = fetch,
}: {
  dir: string;
  userAgent?: string;
  token: string;
  repo: string;
  branch: string;
  fetch?: typeof fetch;
}): UploadStore {
  const checkPath = pathChecker(dir);
  if (!REPO_PATTERN.test(repo)) throw new UploadError("GITHUB_REPO must look like owner/name");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": userAgent,
  };
  const call = async (url: string, init: RequestInit = {}) => {
    try {
      return await fetchImpl(url, { ...init, headers: { ...headers, ...init.headers }, cache: "no-store" });
    } catch {
      throw new UploadError("Could not reach GitHub");
    }
  };
  return {
    kind: "github",
    async put(path, bytes, message) {
      checkPath(path);
      const url = `${API}/repos/${repo}/contents/${path}`;
      const res = await call(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, content: Buffer.from(bytes).toString("base64"), branch }),
      });
      if (res.ok) {
        const body = (await res.json()) as { commit?: { sha?: string; html_url?: string } };
        return { commitSha: body.commit?.sha ?? null, commitUrl: githubLink(body.commit?.html_url), existed: false };
      }
      // 422 without a sha: the file is already there. The name carries a hash
      // of the bytes, but check the blob before calling it the same image.
      if (res.status === 422) {
        const head = await call(`${url}?ref=${encodeURIComponent(branch)}`, { headers: { Accept: "application/vnd.github.object+json" } });
        const existing = head.ok ? ((await head.json()) as { sha?: unknown }).sha : null;
        if (existing === gitBlobSha(bytes)) return { commitSha: null, commitUrl: null, existed: true };
      }
      throw new UploadError(`GitHub returned ${res.status} saving ${path}`);
    },
  };
}

export function createUploads(config: StoreConfig, target: UploadTarget, userAgent?: string): UploadStore {
  return config.kind === "github"
    ? githubUploads({ dir: target.dir, userAgent, token: config.token, repo: config.repo, branch: config.branch })
    : fsUploads(config.root, target.dir);
}

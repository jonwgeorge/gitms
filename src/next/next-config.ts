/**
 * `withGitms()` for next.config.ts:
 *
 *   import { withGitms } from "gitms/next-config";
 *   import cms from "./gitms.config";
 *   export default withGitms(cms, { poweredByHeader: false });
 *
 * It points the package at your config file, lets server actions take an
 * upload, serves the redirects edited in the admin (read from the content
 * files at build time), marks the admin noindex and records which gitms
 * commit the site was built with (for the admin's update notice).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";
import type { ResolvedConfig } from "../config";
import { readPages, readPosts, readRedirects, siteRedirects } from "../content";
import { commitFromLock } from "../core/updates";

export type WithGitmsOptions = {
  /** Your config file, relative to the project root. Defaults to "./gitms.config.ts". */
  readonly configFile?: string;
  /** Where the project root is. Defaults to the working directory (where `next build` runs). */
  readonly root?: string;
};

const ALIAS = "gitms-site-config";

/** Reads a repo-relative JSON content file; a missing file reads as `fallback`. */
function readJson(root: string, file: string, fallback: unknown): unknown {
  let text: string;
  try {
    text = readFileSync(resolve(root, file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not valid JSON`);
  }
}

/** The redirects to serve, from the content files. Exported for tests and custom setups. */
export function gitmsRedirects(cms: ResolvedConfig, root: string = process.cwd(), now: number = Date.now()) {
  if (!cms.redirects) return [];
  const redirects = readRedirects(cms, readJson(root, cms.redirects.file, { redirects: [] }));
  const posts = cms.posts ? readPosts(cms, readJson(root, cms.posts.file, { posts: [] })) : [];
  const pages = cms.pages ? readPages(cms, readJson(root, cms.pages.file, { pages: [] })) : [];
  return siteRedirects(cms, { posts, pages, redirects }, now);
}

/** The gitms commit the site's package-lock.json pins, or null (gitms linked locally, no lockfile). */
export function installedGitmsCommit(root: string = process.cwd()): string | null {
  try {
    return commitFromLock(JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8")));
  } catch {
    return null;
  }
}

/** Bytes as Next's size string, with room for the multipart overhead. */
const bodyLimit = (bytes: number) => `${Math.ceil(bytes / (1024 * 1024)) + 1}mb` as const;

export function withGitms(cms: ResolvedConfig, next: NextConfig = {}, options: WithGitmsOptions = {}): NextConfig {
  const root = options.root ?? process.cwd();
  const configFile = options.configFile ?? "./gitms.config.ts";
  const absolute = resolve(root, configFile);

  return {
    ...next,
    // The admin compares this with gitms's newest commit to offer updates.
    env: { ...next.env, GITMS_INSTALLED_COMMIT: installedGitmsCommit(root) ?? "" },
    // The package ships TypeScript source.
    transpilePackages: [...new Set([...(next.transpilePackages ?? []), "gitms"])],
    turbopack: {
      ...next.turbopack,
      resolveAlias: { ...next.turbopack?.resolveAlias, [ALIAS]: configFile },
    },
    webpack(config, context) {
      config.resolve ??= {};
      config.resolve.alias = { ...config.resolve.alias, [ALIAS]: absolute };
      return typeof next.webpack === "function" ? next.webpack(config, context) : config;
    },
    experimental: {
      ...next.experimental,
      serverActions: {
        ...next.experimental?.serverActions,
        // Image uploads go through a server action.
        bodySizeLimit: next.experimental?.serverActions?.bodySizeLimit ?? (cms.uploads ? bodyLimit(cms.uploads.maxBytes) : undefined),
      },
    },
    async redirects() {
      // The admin's redirects first, so they can repoint ones kept in code.
      const own = typeof next.redirects === "function" ? await next.redirects() : [];
      return [...gitmsRedirects(cms, root), ...own];
    },
    async headers() {
      const own = typeof next.headers === "function" ? await next.headers() : [];
      return [...own, { source: `${cms.basePath}/:path*`, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }, { source: cms.basePath, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
    },
  };
}

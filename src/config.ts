/**
 * The site's gitms config: what `defineGitms()` takes and the resolved shape
 * the rest of the package reads. Client-safe (no secrets; those come from the
 * environment, see core/env.ts). Pure data apart from zod schemas, so
 * next.config can import it too; React components (custom sections, previews)
 * are handed to `createAdmin()` in the admin page instead.
 */
import type { ZodType } from "zod";

/** A custom post field shown in the editor under the title. */
export type CustomField =
  | {
      readonly type: "text";
      readonly label: string;
      /** Defaults to true. */
      readonly required?: boolean;
      /** A regex the trimmed value must match (anchored for you). */
      readonly pattern?: string;
      /** Shown when the pattern doesn't match. */
      readonly patternMessage?: string;
      readonly maxLength?: number;
      /** Lowercase the value before it is stored. */
      readonly lowercase?: boolean;
      /** Offer values already used by other posts as suggestions. */
      readonly suggest?: boolean;
      readonly default?: string;
      readonly hint?: string;
    }
  | {
      readonly type: "select";
      readonly label: string;
      readonly options: readonly string[];
      readonly default?: string;
      readonly hint?: string;
    };

export type PostsConfig = {
  /** Repo-relative JSON file, e.g. "content/posts.json". */
  readonly file: string;
  /** Sidebar label, e.g. "Posts" or "Blog". */
  readonly label?: string;
  /** Public URL of a post; `:slug` is replaced. e.g. "/blog/:slug". */
  readonly route: string;
  /** Slugs a post can't take (they collide with routes under the posts path). */
  readonly reservedSlugs?: readonly string[];
  /** Extra fields stored on each post, keyed by their name in the file. */
  readonly fields?: Readonly<Record<string, CustomField>>;
  readonly max?: number;
};

export type PagesConfig = {
  readonly file: string;
  readonly label?: string;
  /** Public URL of a page; `:slug` is replaced. Defaults to "/:slug". */
  readonly route?: string;
  /** Slugs a page can't take (the site's own routes). The admin path is always reserved. */
  readonly reservedSlugs?: readonly string[];
  /** Offer a "Show in nav" checkbox (stored as `nav: true`). Defaults to true. */
  readonly nav?: boolean;
  readonly max?: number;
};

export type RedirectsConfig = {
  readonly file: string;
  /** Exact paths the site serves itself; a redirect can't start at one. */
  readonly routes?: readonly string[];
  /** Path prefixes the site serves itself (e.g. "/api"). The admin path and "/_next" are always included. */
  readonly routePrefixes?: readonly string[];
  /** Redirects kept in code, applied after the editable ones and shown read-only in the admin. */
  readonly builtIn?: readonly BuiltInRedirect[];
};

export type BuiltInRedirect = { readonly source: string; readonly destination: string; readonly permanent: boolean; readonly label?: string };

export type UploadsConfig = {
  /** Repo-relative folder under public/, e.g. "public/uploads". */
  readonly dir: string;
  /** The URL path that folder is served at, e.g. "/uploads". */
  readonly publicPath: string;
  /** Defaults to 5 MB. */
  readonly maxBytes?: number;
};

/** A section of your own in the admin sidebar; its component is given to `createAdmin()` under the same slug. */
export type CustomSection = {
  /** URL segment under the admin path, e.g. "settings". */
  readonly slug: string;
  readonly label: string;
  /** Show a tile for this section on the dashboard. Defaults to true; it stays in the sidebar either way. */
  readonly dashboard?: boolean;
};

/** A content file of your own (for custom sections), saved through the same store. */
export type ExtraFile = {
  /** Repo-relative JSON file, e.g. "content/site.json". */
  readonly path: string;
  /** Checked before every save; a file that fails is never committed. */
  readonly schema: ZodType;
};

export type GitmsConfig = {
  /** Where the admin lives, e.g. "/admin". Must match your app folder. */
  readonly basePath?: string;
  /** The canonical site URL, e.g. "https://example.com/". */
  readonly siteUrl: string;
  /** Extra hostnames that count as this site when a full URL is pasted. The siteUrl host is always included. */
  readonly hosts?: readonly string[];
  /** IANA time zone the editor shows and takes post dates in. Defaults to UTC. */
  readonly timeZone?: string;
  readonly brand?: {
    /** Shown before the admin path in the sidebar, e.g. "admin@example". */
    readonly name?: string;
  };
  /** Sent to the GitHub API. Defaults to "gitms". */
  readonly userAgent?: string;
  /**
   * The request header holding the client's IP, for login throttling. It must
   * be one your host sets itself (a client must not be able to fake it).
   * Defaults to "cf-connecting-ip" (Cloudflare); on Vercel use "x-real-ip".
   */
  readonly clientIpHeader?: string;
  readonly posts?: PostsConfig;
  readonly pages?: PagesConfig;
  readonly redirects?: RedirectsConfig;
  readonly uploads?: UploadsConfig;
  readonly sections?: readonly CustomSection[];
  /** Content files your custom sections read and save, by key. */
  readonly files?: Readonly<Record<string, ExtraFile>>;
};

export type ResolvedConfig = {
  readonly basePath: string;
  readonly siteUrl: string;
  readonly hosts: readonly string[];
  readonly timeZone: string;
  readonly brand: { readonly name: string };
  readonly userAgent: string;
  readonly clientIpHeader: string;
  readonly posts: (Required<Omit<PostsConfig, "fields">> & { readonly fields: Readonly<Record<string, CustomField>> }) | null;
  readonly pages: Required<PagesConfig> | null;
  readonly redirects: Required<RedirectsConfig> | null;
  readonly uploads: Required<UploadsConfig> | null;
  readonly sections: readonly CustomSection[];
  readonly files: Readonly<Record<string, ExtraFile>>;
};

const BASE_PATH = /^\/[a-z0-9][a-z0-9_-]{0,63}$/;
const REPO_FILE = /^(?!\/)(?!.*\.\.)[\w./-]+\.json$/;
const SEGMENT = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Segments the admin uses itself, so a custom section can't take them. */
const BUILT_IN_SEGMENTS = ["login", "posts", "pages", "redirects", "preview", "history", "new"];

function fail(message: string): never {
  throw new Error(`gitms config: ${message}`);
}

/** Checks a config and fills in the defaults. Throws a readable error on a bad config. */
export function defineGitms(config: GitmsConfig): ResolvedConfig {
  const basePath = config.basePath ?? "/admin";
  if (!BASE_PATH.test(basePath)) fail(`basePath must look like "/admin" (got ${JSON.stringify(basePath)})`);

  let site: URL;
  try {
    site = new URL(config.siteUrl);
  } catch {
    fail("siteUrl must be an absolute URL like https://example.com/");
  }
  if (site.protocol !== "https:" && site.protocol !== "http:") fail("siteUrl must start with https://");
  const siteUrl = site.href.endsWith("/") ? site.href : `${site.href}/`;
  const hosts = [...new Set([site.hostname, ...(config.hosts ?? [])].map((h) => h.toLowerCase()))];

  const timeZone = config.timeZone ?? "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    fail(`timeZone ${JSON.stringify(timeZone)} is not an IANA time zone`);
  }

  const checkFile = (what: string, file: string) => {
    if (!REPO_FILE.test(file)) fail(`${what}.file must be a repo-relative .json path (got ${JSON.stringify(file)})`);
  };

  let posts: ResolvedConfig["posts"] = null;
  if (config.posts) {
    checkFile("posts", config.posts.file);
    if (!config.posts.route.includes(":slug")) fail('posts.route must contain ":slug"');
    for (const [name, field] of Object.entries(config.posts.fields ?? {})) {
      if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(name) || CORE_POST_FIELDS.includes(name)) fail(`posts.fields.${name}: pick another name`);
      if (field.type === "select" && field.options.length === 0) fail(`posts.fields.${name} needs at least one option`);
    }
    posts = {
      file: config.posts.file,
      label: config.posts.label ?? "Posts",
      route: config.posts.route,
      reservedSlugs: config.posts.reservedSlugs ?? [],
      fields: config.posts.fields ?? {},
      max: config.posts.max ?? 1000,
    };
  }

  let pages: ResolvedConfig["pages"] = null;
  if (config.pages) {
    checkFile("pages", config.pages.file);
    const route = config.pages.route ?? "/:slug";
    if (!route.includes(":slug")) fail('pages.route must contain ":slug"');
    pages = {
      file: config.pages.file,
      label: config.pages.label ?? "Pages",
      route,
      reservedSlugs: [...new Set([basePath.slice(1), ...(config.pages.reservedSlugs ?? [])])],
      nav: config.pages.nav ?? true,
      max: config.pages.max ?? 200,
    };
  }

  let redirects: ResolvedConfig["redirects"] = null;
  if (config.redirects) {
    checkFile("redirects", config.redirects.file);
    redirects = {
      file: config.redirects.file,
      routes: config.redirects.routes ?? ["/"],
      routePrefixes: [...new Set([basePath, "/_next", ...(config.redirects.routePrefixes ?? [])])],
      builtIn: config.redirects.builtIn ?? [],
    };
  }

  let uploads: ResolvedConfig["uploads"] = null;
  if (config.uploads) {
    const { dir, publicPath } = config.uploads;
    if (!/^public\/[\w-]+(?:\/[\w-]+)*$/.test(dir)) fail('uploads.dir must be a folder under public/, e.g. "public/uploads"');
    if (!/^\/[\w-]+(?:\/[\w-]+)*$/.test(publicPath)) fail('uploads.publicPath must look like "/uploads"');
    uploads = { dir, publicPath, maxBytes: config.uploads.maxBytes ?? 5 * 1024 * 1024 };
  }

  const sections = config.sections ?? [];
  const seen = new Set<string>();
  for (const s of sections) {
    if (!SEGMENT.test(s.slug) || BUILT_IN_SEGMENTS.includes(s.slug) || seen.has(s.slug)) fail(`sections: "${s.slug}" can't be used as a section slug`);
    seen.add(s.slug);
  }

  const files: Record<string, ExtraFile> = {};
  for (const [key, file] of Object.entries(config.files ?? {})) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(key) || ["posts", "pages", "redirects"].includes(key)) fail(`files: "${key}" can't be used as a file key`);
    checkFile(`files.${key}`, file.path);
    files[key] = file;
  }

  return {
    basePath,
    siteUrl,
    hosts,
    timeZone,
    brand: { name: config.brand?.name ?? "admin" },
    userAgent: config.userAgent ?? "gitms",
    clientIpHeader: (config.clientIpHeader ?? "cf-connecting-ip").toLowerCase(),
    posts,
    pages,
    redirects,
    uploads,
    sections,
    files,
  };
}

/** Post fields gitms owns; a custom field can't reuse these names. */
export const CORE_POST_FIELDS = ["slug", "title", "at", "draft", "description", "shareImage", "body", "status"];

/** The public URL of an item from a `:slug` route pattern. */
export const routeFor = (route: string, slug: string) => route.replace(":slug", encodeURIComponent(slug));

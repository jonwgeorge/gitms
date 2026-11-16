/**
 * The content schemas, built from the site's config: posts, pages and
 * redirects. One source of rules for the site's build, the admin editor and
 * the save path, so nothing invalid is rendered or committed.
 */
import { z } from "zod";
import type { CustomField, ResolvedConfig } from "../config";
import { isSafeHref } from "./href";

export { isSafeHref };

/** The longest search/share description a post or page may have. */
export const DESCRIPTION_MAX = 300;
export const BODY_MAX = 60_000;
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** A full ISO 8601 date-time with an explicit offset that parses to a real date. */
export function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && ISO.test(value) && !Number.isNaN(Date.parse(value));
}

const text = (max: number) => z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);

const iso = z.string().trim().refine(isIsoDateTime, "Use an ISO date-time with an offset, e.g. 2026-10-12T03:00:00Z");

/**
 * Optional search and share fields for a post or page. `description` replaces
 * the excerpt in search results and link previews; `shareImage` is the
 * picture a link preview shows (a site path like /uploads/…, or https).
 */
const seoFields = {
  description: z.string().trim().min(1, "Required").max(DESCRIPTION_MAX, `At most ${DESCRIPTION_MAX} characters`).optional(),
  shareImage: z
    .string()
    .trim()
    .min(1, "Required")
    .max(300, "At most 300 characters")
    .refine(isSafeHref, 'Use a site path ("/uploads/…") or an https:// link')
    .optional(),
};

const body = z.string().max(BODY_MAX, `At most ${BODY_MAX} characters`);

function slugSchema(reserved: readonly string[], example: string, taken: string) {
  const set: ReadonlySet<string> = new Set(reserved);
  return z
    .string()
    .trim()
    .regex(SLUG_PATTERN, `Use lowercase letters, digits and dashes (up to 80), e.g. ${example}`)
    .refine((slug) => !set.has(slug), taken);
}

/** The zod schema for one custom post field. */
export function customFieldSchema(field: CustomField): z.ZodType {
  if (field.type === "select") {
    const options = field.options as [string, ...string[]];
    return z.enum(options, { error: `${field.label} must be one of ${options.join(", ")}` });
  }
  let s = z.string().trim();
  const max = field.maxLength ?? 200;
  if (field.required === false) {
    let opt = s.max(max, `At most ${max} characters`);
    if (field.pattern) opt = opt.regex(new RegExp(`^(?:${field.pattern})$`), field.patternMessage ?? "Not in the expected format");
    return opt.optional();
  }
  s = s.min(1, "Required").max(max, `At most ${max} characters`);
  if (field.pattern) s = s.regex(new RegExp(`^(?:${field.pattern})$`), field.patternMessage ?? "Not in the expected format");
  return s;
}

function uniqueSlugs(list: string, noun: string, prefix: string) {
  return (file: Record<string, { slug: string }[]>, ctx: z.RefinementCtx) => {
    // Every copy of a repeated slug is flagged, so whichever item is being edited gets the error.
    const counts = new Map<string, number>();
    for (const item of file[list]) counts.set(item.slug, (counts.get(item.slug) ?? 0) + 1);
    file[list].forEach((item, i) => {
      if (counts.get(item.slug)! > 1) ctx.addIssue({ code: "custom", path: [list, i, "slug"], message: `Another ${noun} already uses ${prefix}${item.slug}` });
    });
  };
}

export function postSchemaFor(cms: ResolvedConfig) {
  const posts = cms.posts;
  if (!posts) throw new Error("gitms: posts are not configured");
  const custom = Object.fromEntries(Object.entries(posts.fields).map(([name, f]) => [name, customFieldSchema(f)]));
  return z.strictObject({
    slug: slugSchema(posts.reservedSlugs, "my-first-post", "That slug is taken by a route"),
    title: text(160),
    at: iso,
    ...custom,
    draft: z.boolean().optional(),
    ...seoFields,
    body,
  });
}

export function pageSchemaFor(cms: ResolvedConfig) {
  const pages = cms.pages;
  if (!pages) throw new Error("gitms: pages are not configured");
  return z.strictObject({
    slug: slugSchema(pages.reservedSlugs, "about", "That URL is already used by the site; pick another slug"),
    title: text(120),
    /** Linked in the site header. */
    nav: z.boolean().optional(),
    draft: z.boolean().optional(),
    ...seoFields,
    body,
  });
}

/**
 * A redirect's old URL: an exact path like `/old-page` or `/blog/old-post`.
 * No query, no trailing slash, and none of Next's pattern characters (`:`,
 * `*`, `(`…), so it only ever matches itself.
 */
export const REDIRECT_FROM_PATTERN = /^(?:\/[A-Za-z0-9._~-]+)+$/;

/** A redirect target: a site path (no pattern characters) or an https URL. */
export function isRedirectTo(value: string): boolean {
  if (!isSafeHref(value)) return false;
  if (value.startsWith("/")) return /^\/[A-Za-z0-9._~\/-]*(?:[?#][A-Za-z0-9._~\/=&%#-]*)?$/.test(value);
  return !/[*()]/.test(value);
}

/** Whether `path` is one of the site's own routes (a redirect from it would hide the page). */
export function isRouteFrom(cms: ResolvedConfig, path: string): boolean {
  const r = cms.redirects;
  const routes = r?.routes ?? ["/"];
  const prefixes = r?.routePrefixes ?? [cms.basePath, "/_next"];
  return routes.includes(path) || prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Whether following redirects from `from` comes back round to a path already visited. */
function chainLoops(from: string, next: ReadonlyMap<string, string>): boolean {
  const seen = new Set<string>();
  let at: string | undefined = from;
  while (at !== undefined) {
    if (seen.has(at)) return true;
    seen.add(at);
    at = next.get(at.split(/[?#]/)[0]);
  }
  return false;
}

export function redirectSchemaFor(cms: ResolvedConfig) {
  return z.strictObject({
    from: z
      .string()
      .trim()
      .max(200, "At most 200 characters")
      .regex(REDIRECT_FROM_PATTERN, "Use a path like /old-page (letters, digits, - _ . ~ and /, no trailing slash or ?query)")
      .refine((v) => !isRouteFrom(cms, v), "That URL is one of the site's own pages; a redirect would hide it"),
    to: z.string().trim().min(1, "Required").max(300, "At most 300 characters").refine(isRedirectTo, "Use a path like /new-page or a URL starting with https://"),
    /** 308 when true (browsers and search engines remember it); 307 otherwise. */
    permanent: z.boolean(),
  });
}

export type Schemas = ReturnType<typeof buildSchemas>;

function buildSchemas(cms: ResolvedConfig) {
  const post = cms.posts ? postSchemaFor(cms) : null;
  const page = cms.pages ? pageSchemaFor(cms) : null;
  const redirect = redirectSchemaFor(cms);
  return {
    post,
    posts: post ? z.strictObject({ posts: z.array(post).max(cms.posts!.max, `At most ${cms.posts!.max} posts`) }).superRefine(uniqueSlugs("posts", "post", "")) : null,
    page,
    pages: page ? z.strictObject({ pages: z.array(page).max(cms.pages!.max, `At most ${cms.pages!.max} pages`) }).superRefine(uniqueSlugs("pages", "page", "/")) : null,
    redirect,
    redirects: z
      .strictObject({ redirects: z.array(redirect).max(500, "At most 500 redirects") })
      .superRefine((file, ctx) => {
        const counts = new Map<string, number>();
        for (const r of file.redirects) counts.set(r.from, (counts.get(r.from) ?? 0) + 1);
        const next = new Map(file.redirects.map((r) => [r.from, r.to]));
        file.redirects.forEach((r, i) => {
          if (counts.get(r.from)! > 1) ctx.addIssue({ code: "custom", path: ["redirects", i, "from"], message: `Another redirect already starts at ${r.from}` });
          else if (r.to.split(/[?#]/)[0] === r.from) ctx.addIssue({ code: "custom", path: ["redirects", i, "to"], message: "A redirect can't point at itself" });
          else if (chainLoops(r.from, next)) ctx.addIssue({ code: "custom", path: ["redirects", i, "to"], message: "This would make a redirect loop" });
        });
      }),
  };
}

const cache = new WeakMap<ResolvedConfig, Schemas>();

/** The schemas for a config (built once per config object). */
export function schemasFor(cms: ResolvedConfig): Schemas {
  let s = cache.get(cms);
  if (!s) cache.set(cms, (s = buildSchemas(cms)));
  return s;
}

export type Post = { slug: string; title: string; at: string; draft?: boolean; description?: string; shareImage?: string; body: string } & Record<string, unknown>;
export type Page = { slug: string; title: string; nav?: boolean; draft?: boolean; description?: string; shareImage?: string; body: string };
export type Redirect = { from: string; to: string; permanent: boolean };

export type ContentIssue = { readonly path: string; readonly message: string };

/** Flattens zod issues to `posts.1.title: message` pairs. */
export function issuesOf(error: z.ZodError): ContentIssue[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

export type Validation<T> = { ok: true; data: T } | { ok: false; issues: ContentIssue[] };

export function validateWith<T>(schema: z.ZodType<T>, raw: unknown): Validation<T> {
  const r = schema.safeParse(raw);
  return r.success ? { ok: true, data: r.data } : { ok: false, issues: issuesOf(r.error) };
}

/**
 * Validates a content file and throws a readable error naming the file and
 * every bad field. Used at build time, so bad content fails `next build`.
 */
export function parseContent<T>(schema: z.ZodType<T>, raw: unknown, label: string): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw contentError(label, issuesOf(result.error));
}

export function contentError(label: string, issues: readonly ContentIssue[]): Error {
  const lines = issues.map((i) => `  - ${i.path || "(root)"}: ${i.message}`);
  return new Error(`${label} is invalid:\n${lines.join("\n")}`);
}

/**
 * The post editor's form model (client-safe). Dates are shown in the site's
 * time zone with a datetime-local input and stored as ISO with the offset.
 * Custom fields (config `posts.fields`) travel as top-level form fields under
 * their own names, so schema issues map straight back to them.
 */
import type { CustomField } from "../config";
import { fromLocalInput, localNow, toLocalInput } from "./site-time";

export type PostDraft = {
  slug: string;
  title: string;
  /** `YYYY-MM-DDTHH:mm` in the site zone. */
  at: string;
  /** Custom fields by name, as typed. */
  fields: Record<string, string>;
  status: "published" | "draft";
  body: string;
  /** Optional search/share summary; empty means "use the excerpt". */
  description: string;
  /** Optional link-preview image; empty means none. */
  shareImage: string;
};

export type PostFieldsConfig = { readonly fields: Readonly<Record<string, CustomField>>; readonly timeZone: string };

/** Every field name the post form owns, for mapping schema issues. */
export const postFields = (c: PostFieldsConfig) => ["slug", "title", "at", ...Object.keys(c.fields), "draft", "description", "shareImage", "body"];

type Loose = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

const fieldDefault = (f: CustomField) => f.default ?? (f.type === "select" ? f.options[0] : "");

export function toPostDraft(post: Loose, c: PostFieldsConfig): PostDraft {
  return {
    slug: s(post.slug),
    title: s(post.title),
    at: toLocalInput(s(post.at), c.timeZone) || s(post.at),
    fields: Object.fromEntries(Object.entries(c.fields).map(([name, f]) => [name, s(post[name]) || (f.type === "select" ? fieldDefault(f) : "")])),
    status: post.draft === true ? "draft" : "published",
    body: s(post.body),
    description: s(post.description),
    shareImage: s(post.shareImage),
  };
}

export const emptyPost = (c: PostFieldsConfig): PostDraft => ({
  slug: "",
  title: "",
  at: localNow(c.timeZone),
  fields: Object.fromEntries(Object.entries(c.fields).map(([name, f]) => [name, fieldDefault(f)])),
  status: "draft",
  body: "",
  description: "",
  shareImage: "",
});

/** `Why I self-host the boring stuff!` → `why-i-self-host-the-boring-stuff`. */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

const MAX = 70_000;
const get = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v.slice(0, MAX) : "";
};

export function readPostDraft(fd: FormData, c: PostFieldsConfig): PostDraft {
  return {
    slug: get(fd, "slug").trim().toLowerCase(),
    title: get(fd, "title"),
    at: get(fd, "at"),
    fields: Object.fromEntries(Object.keys(c.fields).map((name) => [name, get(fd, name).slice(0, 4000)])),
    status: get(fd, "status") === "draft" ? "draft" : "published",
    // Normalise line endings so a browser's CRLF doesn't churn the file.
    body: get(fd, "body").replace(/\r\n?/g, "\n"),
    // One line: a browser's newlines in the description become spaces.
    description: get(fd, "description").replace(/\s+/g, " "),
    shareImage: get(fd, "shareImage"),
  };
}

/** The stored post (the schema then judges it). An empty slug is made from the title; empty optional fields are left out. */
export function postContent(d: PostDraft, c: PostFieldsConfig): Loose {
  const custom: Loose = {};
  for (const [name, f] of Object.entries(c.fields)) {
    let v = (d.fields[name] ?? "").trim();
    if (f.type === "text" && f.lowercase) v = v.toLowerCase();
    if (v === "" && f.type === "text" && f.required === false) continue;
    custom[name] = v;
  }
  return {
    slug: d.slug.trim() || slugify(d.title),
    title: d.title.trim(),
    at: fromLocalInput(d.at, c.timeZone) ?? d.at.trim(),
    ...custom,
    ...(d.status === "draft" ? { draft: true } : {}),
    ...seoContent(d),
    body: d.body.replace(/\s+$/, ""),
  };
}

/** The values a text field already has across posts, most recent first (suggestions for a new post). */
export function usedValues(file: unknown, field: string): string[] {
  const posts = Array.isArray((file as { posts?: unknown } | null)?.posts) ? (file as { posts: unknown[] }).posts : [];
  const dated = posts
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null && typeof (p as Loose)[field] === "string")
    .map((p) => ({ v: p[field] as string, at: typeof p.at === "string" ? Date.parse(p.at) || 0 : 0 }))
    .sort((a, b) => b.at - a.at);
  return [...new Set(dated.map((p) => p.v).filter(Boolean))];
}

/** The optional search/share fields as stored: empty ones are left out of the file. */
export function seoContent(d: { description: string; shareImage: string }): Loose {
  const description = d.description.trim();
  const shareImage = d.shareImage.trim();
  return { ...(description ? { description } : {}), ...(shareImage ? { shareImage } : {}) };
}

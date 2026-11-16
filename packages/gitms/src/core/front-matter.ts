/**
 * YAML-ish front matter at the top of pasted markdown, e.g.
 *
 *     ---
 *     title: "i built my own cms"
 *     slug: my-cms
 *     draft: true
 *     ---
 *
 * The editors read it so a post written elsewhere can be pasted in whole.
 * Hand-written (no YAML dependency): flat `key: value` lines only. Lists,
 * nested maps and unknown keys are skipped. Client-safe.
 */
import type { CustomField } from "../config";
import { toLocalInput } from "./site-time";

export type FrontMatter = { data: Record<string, string>; body: string };

const OPEN = /^﻿?[ \t]*---[ \t]*\r?\n/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*$/;
const LINE = /^([A-Za-z_][\w-]*)[ \t]*:(?:[ \t]+(.*))?$/;

function scalar(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"/.exec(v);
    if (m) return m[1].replace(/\\(["\\/nt])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
  }
  if (v.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'/.exec(v);
    if (m) return m[1].replace(/''/g, "'");
  }
  // An unquoted value ends at a " #" comment.
  return v.replace(/[ \t]+#.*$/, "").trim();
}

/** Splits a leading front matter block off `text`; null when there isn't one. */
export function parseFrontMatter(text: string): FrontMatter | null {
  const open = OPEN.exec(text);
  if (!open) return null;
  const lines = text.slice(open[0].length).split(/\r?\n/);
  const end = lines.findIndex((l) => CLOSE.test(l));
  if (end < 0) return null;
  const data: Record<string, string> = {};
  for (const line of lines.slice(0, end)) {
    if (!line.trim() || line.trimStart().startsWith("#") || /^\s/.test(line)) continue;
    const m = LINE.exec(line);
    if (!m || m[2] === undefined) continue; // a bare `key:` starts a list or map, which we skip
    const value = m[2].trim();
    if (value.startsWith("[") || value.startsWith("{") || value === "|" || value === ">") continue;
    data[m[1].toLowerCase()] = scalar(value);
  }
  const body = lines.slice(end + 1).join("\n").replace(/^(?:[ \t]*\r?\n)+/, "");
  return { data, body };
}

/** The editor fields front matter can fill. */
export type FrontMatterFields = Partial<{
  title: string;
  slug: string;
  at: string;
  /** Custom post fields, by name. */
  fields: Record<string, string>;
  status: "published" | "draft";
  nav: boolean;
  description: string;
  shareImage: string;
}>;

const truthy = (v: string) => /^(?:true|yes|on|1)$/i.test(v);
const falsy = (v: string) => /^(?:false|no|off|0)$/i.test(v);

/** A front matter date → the `YYYY-MM-DDTHH:mm` a datetime-local shows, or "" if unreadable. */
export function frontMatterDate(v: string, currentTime = "09:00", timeZone = "UTC"): string {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T${currentTime}`;
  // No zone given: the writer meant the site's own clock.
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
  if (local) return `${local[1]}T${local[2]}`;
  return toLocalInput(s, timeZone);
}

const pick = (d: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (d[k] !== undefined && d[k] !== "") return d[k];
  return undefined;
};

/**
 * Maps front matter keys onto the editor's fields. `kind` drops the post-only
 * ones for pages; custom post fields are matched by name (case-insensitive).
 * Values that wouldn't fit a field (an unknown select option, an unreadable
 * date) are left out rather than guessed.
 */
export function frontMatterFields(
  data: Record<string, string>,
  kind: "post" | "page",
  opts: { readonly fields?: Readonly<Record<string, CustomField>>; readonly timeZone?: string; readonly currentTime?: string } = {},
): FrontMatterFields {
  const out: FrontMatterFields = {};
  const title = pick(data, "title");
  if (title !== undefined) out.title = title;
  const slug = pick(data, "slug");
  if (slug !== undefined) out.slug = slug.trim().toLowerCase();
  const description = pick(data, "description", "summary", "excerpt");
  if (description !== undefined) out.description = description;
  const image = pick(data, "shareimage", "share_image", "image", "cover");
  if (image !== undefined) out.shareImage = image.trim();

  const draft = pick(data, "draft");
  const status = pick(data, "status")?.toLowerCase();
  if (draft !== undefined && (truthy(draft) || falsy(draft))) out.status = truthy(draft) ? "draft" : "published";
  else if (status === "draft" || status === "published") out.status = status;
  else if (status === "publish" || status === "live") out.status = "published";

  if (kind === "page") {
    const nav = pick(data, "nav");
    if (nav !== undefined && (truthy(nav) || falsy(nav))) out.nav = truthy(nav);
    return out;
  }

  const at = pick(data, "at", "date");
  if (at !== undefined) {
    const local = frontMatterDate(at, opts.currentTime, opts.timeZone);
    if (local) out.at = local;
  }
  const fields: Record<string, string> = {};
  for (const [name, field] of Object.entries(opts.fields ?? {})) {
    const v = pick(data, name.toLowerCase())?.trim();
    if (v === undefined) continue;
    if (field.type === "select") {
      const option = field.options.find((o) => o.toLowerCase() === v.toLowerCase());
      if (option) fields[name] = option;
    } else fields[name] = field.lowercase ? v.toLowerCase() : v;
  }
  if (Object.keys(fields).length) out.fields = fields;
  return out;
}

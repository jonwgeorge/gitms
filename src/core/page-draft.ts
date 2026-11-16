/** The page editor's form model (client-safe). */
import { seoContent, slugify } from "./post-draft";

export type PageDraft = {
  slug: string;
  title: string;
  status: "published" | "draft";
  /** Linked in the site header. */
  nav: boolean;
  body: string;
  /** Optional search/share summary; empty means "use the excerpt". */
  description: string;
  /** Optional link-preview image; empty means none. */
  shareImage: string;
};

export const PAGE_FIELDS = ["slug", "title", "nav", "draft", "description", "shareImage", "body"] as const;

type Loose = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

export function toPageDraft(page: Loose): PageDraft {
  return {
    slug: s(page.slug),
    title: s(page.title),
    status: page.draft === true ? "draft" : "published",
    nav: page.nav === true,
    body: s(page.body),
    description: s(page.description),
    shareImage: s(page.shareImage),
  };
}

export const emptyPage = (): PageDraft => ({ slug: "", title: "", status: "draft", nav: false, body: "", description: "", shareImage: "" });

const MAX = 70_000;
const get = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v.slice(0, MAX) : "";
};

export function readPageDraft(fd: FormData): PageDraft {
  return {
    slug: get(fd, "slug").trim().toLowerCase(),
    title: get(fd, "title"),
    status: get(fd, "status") === "draft" ? "draft" : "published",
    nav: get(fd, "nav") === "on",
    // Normalise line endings so a browser's CRLF doesn't churn the file.
    body: get(fd, "body").replace(/\r\n?/g, "\n"),
    // One line: a browser's newlines in the description become spaces.
    description: get(fd, "description").replace(/\s+/g, " "),
    shareImage: get(fd, "shareImage"),
  };
}

/** The stored page (the schema then judges it). An empty slug is made from the title. */
export function pageContent(d: PageDraft): Loose {
  return {
    slug: d.slug.trim() || slugify(d.title),
    title: d.title.trim(),
    ...(d.nav ? { nav: true } : {}),
    ...(d.status === "draft" ? { draft: true } : {}),
    ...seoContent(d),
    body: d.body.replace(/\s+$/, ""),
  };
}

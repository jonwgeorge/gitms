/**
 * Reading content in the site itself: validate the JSON files you import (so
 * bad content fails `next build`), then pick what's public. Pure functions;
 * pass the config from your gitms.config.ts.
 *
 *   import cms from "@/gitms.config";
 *   import postsFile from "@/content/posts.json";
 *   export const posts = readPosts(cms, postsFile);
 *   export const live = publishedPosts(posts);
 */
import { routeFor, type ResolvedConfig } from "./config";
import { activeRedirects, isLivePost, isScheduled, livePaths } from "./core/redirects";
import { parseContent, schemasFor, type Page, type Post, type Redirect } from "./core/schema";

export { isLivePost, isScheduled, livePostUrl, postStatus } from "./core/redirects";
export type { Page, Post, Redirect } from "./core/schema";

/** The posts file's posts, validated; throws a readable error naming every bad field. */
export function readPosts(cms: ResolvedConfig, raw: unknown): Post[] {
  const schema = schemasFor(cms).posts;
  if (!schema || !cms.posts) throw new Error("gitms: posts are not configured");
  return parseContent(schema, raw, cms.posts.file).posts as Post[];
}

export function readPages(cms: ResolvedConfig, raw: unknown): Page[] {
  const schema = schemasFor(cms).pages;
  if (!schema || !cms.pages) throw new Error("gitms: pages are not configured");
  return parseContent(schema, raw, cms.pages.file).pages as Page[];
}

export function readRedirects(cms: ResolvedConfig, raw: unknown): Redirect[] {
  return parseContent(schemasFor(cms).redirects, raw, cms.redirects?.file ?? "redirects").redirects;
}

const newestFirst = (a: { at: string }, b: { at: string }) => Date.parse(b.at) - Date.parse(a.at);

/** Posts that are out: not drafts and not dated after `now`, newest first. */
export function publishedPosts<P extends Post>(posts: readonly P[], now: number = Date.now()): P[] {
  return posts.filter((p) => !p.draft && !isScheduled(p, now)).sort(newestFirst);
}

/** Published posts with a page of their own (a body); a title-only post is a short entry. */
export function postsWithPages<P extends Post>(posts: readonly P[], now: number = Date.now()): P[] {
  return posts.filter((p) => isLivePost(p, now)).sort(newestFirst);
}

export const publishedPages = <P extends Page>(pages: readonly P[]): P[] => pages.filter((p) => !p.draft);

/** Pages marked "show in nav", in file order. */
export const navPages = <P extends Page>(pages: readonly P[]): P[] => publishedPages(pages).filter((p) => p.nav);

export const postUrl = (cms: ResolvedConfig, post: Pick<Post, "slug">) => routeFor(cms.posts!.route, post.slug);
export const pageUrl = (cms: ResolvedConfig, page: Pick<Page, "slug">) => routeFor(cms.pages!.route, page.slug);

/**
 * The redirects the site serves, in Next's `redirects()` shape: the editable
 * ones (minus any whose old URL is a live page again), then the built-in ones.
 */
export function siteRedirects(cms: ResolvedConfig, content: { posts?: readonly Post[]; pages?: readonly Page[]; redirects: readonly Redirect[] }, now: number = Date.now()) {
  const live = livePaths(cms, content.pages ?? [], content.posts ?? [], now);
  const builtIn = (cms.redirects?.builtIn ?? []).map(({ source, destination, permanent }) => ({ source, destination, permanent }));
  return [...activeRedirects(content.redirects, live), ...builtIn];
}

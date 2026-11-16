/**
 * Previews of posts and pages that aren't on the site yet. The public routes
 * are usually built from published items only, so a draft or scheduled item
 * 404s there; a signed-in editor sees it at <basePath>/preview/… instead (the
 * session cookie is scoped to the admin path, and the proxy marks it noindex).
 */
import { routeFor, type ResolvedConfig } from "../config";
import { isScheduled, livePostUrl } from "./redirects";

export type PreviewState = { readonly kind: "draft" } | { readonly kind: "scheduled"; readonly at: string };

/** Why a stored post isn't on the site yet, or null when it is (or would be, once built). */
export function postPreviewState(post: { draft?: unknown; at?: unknown }, now: number = Date.now()): PreviewState | null {
  if (post.draft === true) return { kind: "draft" };
  const at = String(post.at ?? "");
  return at && isScheduled({ at }, now) ? { kind: "scheduled", at } : null;
}

export const pagePreviewState = (page: { draft?: unknown }): PreviewState | null => (page.draft === true ? { kind: "draft" } : null);

export const postPreviewHref = (cms: ResolvedConfig, slug: string) => `${cms.basePath}/preview/posts/${encodeURIComponent(slug)}`;
export const pagePreviewHref = (cms: ResolvedConfig, slug: string) => `${cms.basePath}/preview/pages/${encodeURIComponent(slug)}`;

/** Where the editor's "View on site" goes: the public URL when it's live, the preview when it's a draft or scheduled. */
/** `canPreview`: the site gave the admin a post preview component. */
export function postViewHref(cms: ResolvedConfig, post: { slug?: unknown; draft?: unknown; body?: unknown; at?: unknown }, canPreview: boolean, now: number = Date.now()): string | null {
  const live = livePostUrl(cms, post, now);
  if (live) return live;
  return postPreviewState(post, now) && canPreview ? postPreviewHref(cms, String(post.slug ?? "")) : null;
}

export function pageViewHref(cms: ResolvedConfig, page: { slug?: unknown; draft?: unknown }, canPreview: boolean): string | null {
  if (!cms.pages) return null;
  const slug = String(page.slug ?? "");
  if (!pagePreviewState(page)) return routeFor(cms.pages.route, slug);
  return canPreview ? pagePreviewHref(cms, slug) : null;
}

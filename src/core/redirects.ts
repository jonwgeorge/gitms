/**
 * Redirects from the redirects file, applied by `withGitms()` at build time.
 * Pure helpers live here so the admin and the build agree on which redirects
 * are live.
 */
import { routeFor, type ResolvedConfig } from "../config";
import type { Redirect } from "./schema";

type Item = { readonly slug: string; readonly draft?: boolean };
type PostItem = Item & { readonly body: string; readonly at?: string };

/** Whether a post is published but dated in the future (it goes live when a build runs after `at`). */
export function isScheduled(post: { at?: unknown }, now: number = Date.now()): boolean {
  const at = typeof post.at === "string" ? Date.parse(post.at) : NaN;
  return !Number.isNaN(at) && at > now;
}

/** Whether a post has a public page right now: published, has a body and isn't scheduled. */
export function isLivePost(post: { draft?: unknown; body?: unknown; at?: unknown }, now: number = Date.now()): boolean {
  return post.draft !== true && String(post.body ?? "").trim() !== "" && !isScheduled(post, now);
}

/** The paths that are live pages or post pages right now (a redirect from one would hide it). Scheduled posts aren't live yet. */
export function livePaths(cms: ResolvedConfig, pages: readonly Item[], posts: readonly PostItem[], now: number = Date.now()): Set<string> {
  return new Set([
    ...(cms.pages ? pages.filter((p) => !p.draft).map((p) => routeFor(cms.pages!.route, p.slug)) : []),
    ...(cms.posts ? posts.filter((p) => isLivePost(p, now)).map((p) => routeFor(cms.posts!.route, p.slug)) : []),
  ]);
}

/** Why a redirect is not applied, or null when it is. */
export function inactiveReason(redirect: Pick<Redirect, "from">, live: ReadonlySet<string>): string | null {
  return live.has(redirect.from) ? `${redirect.from} is a live page now, so this redirect is skipped` : null;
}

/** The redirects the build serves: all but those whose old URL is live again. */
export function activeRedirects(redirects: readonly Redirect[], live: ReadonlySet<string>) {
  return redirects.filter((r) => inactiveReason(r, live) === null).map((r) => ({ source: r.from, destination: r.to, permanent: r.permanent }));
}

/**
 * The redirects after renaming a live URL `from` to `to`: adds `from → to`
 * (permanent), repoints earlier redirects that led to `from` so there are no
 * chains, and drops any redirect that started at `to`, since `to` is live now.
 */
export function withRename(redirects: readonly Redirect[], from: string, to: string): Redirect[] {
  if (from === to) return [...redirects];
  const kept = redirects.filter((r) => r.from !== to && r.from !== from).map((r) => (r.to === from ? { ...r, to } : r));
  return [...kept, { from, to, permanent: true }];
}

/** A post's public URL when it has a page now, else null. */
export function livePostUrl(cms: ResolvedConfig, post: { slug?: unknown; draft?: unknown; body?: unknown; at?: unknown }, now: number = Date.now()): string | null {
  if (!cms.posts || !isLivePost(post, now)) return null;
  return routeFor(cms.posts.route, String(post.slug ?? ""));
}

/** How the admin labels a post: Draft, Scheduled (dated in the future) or Published. */
export function postStatus(post: { draft?: unknown; at?: unknown }, now: number = Date.now()) {
  if (post.draft === true) return { label: "Draft", tone: "warn" } as const;
  if (isScheduled(post, now)) return { label: "Scheduled", tone: "info" } as const;
  return { label: "Published", tone: "ok" } as const;
}

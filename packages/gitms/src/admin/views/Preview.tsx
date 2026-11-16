import { notFound, redirect } from "next/navigation";
import type { ComponentType } from "react";
import { routeFor } from "../../config";
import { pagePreviewState, postPreviewState } from "../../core/preview";
import { livePostUrl } from "../../core/redirects";
import { schemasFor } from "../../core/schema";
import { admin, cms } from "../../runtime";
import { LoadError } from "../LoadError";
import { PreviewBanner } from "../PreviewBanner";
import { readList, signedIn } from "./common";

const INVALID = "it has fields that don't validate yet (fix them in the editor)";

/**
 * A draft or scheduled post as it will look on the site, for the signed-in
 * admin only, rendered by the site's own preview component. Read from
 * the store, so it shows the latest save before any deploy.
 */
export async function PreviewPost({ slug, render: Render }: { slug: string; render: ComponentType<{ post: Record<string, unknown> }> }) {
  const c = cms();
  const s = await signedIn();
  if ("page" in s) return s.page;
  const loaded = await readList(s.store, "posts", "posts");
  if (!loaded.ok) return <LoadError title="Preview post" current={admin("/posts")} message={loaded.message} />;
  const raw = loaded.items.find((p) => p.slug === slug);
  if (!raw) notFound();
  const state = postPreviewState(raw);
  // Live already: show the real page (or the site's home, for a post without a page).
  if (!state) redirect(livePostUrl(c, raw) ?? "/");
  const parsed = schemasFor(c).post!.safeParse(raw);
  if (!parsed.success) return <LoadError title="Preview post" current={admin("/posts")} message={INVALID} />;
  return (
    <>
      <PreviewBanner state={state} editHref={admin(`/posts/${encodeURIComponent(slug)}`)} />
      <Render post={parsed.data as Record<string, unknown>} />
    </>
  );
}

export async function PreviewPage({ slug, render: Render }: { slug: string; render: ComponentType<{ page: Record<string, unknown> }> }) {
  const c = cms();
  const s = await signedIn();
  if ("page" in s) return s.page;
  const loaded = await readList(s.store, "pages", "pages");
  if (!loaded.ok) return <LoadError title="Preview page" current={admin("/pages")} message={loaded.message} />;
  const raw = loaded.items.find((p) => p.slug === slug);
  if (!raw) notFound();
  const state = pagePreviewState(raw);
  if (!state) redirect(routeFor(c.pages!.route, slug));
  const parsed = schemasFor(c).page!.safeParse(raw);
  if (!parsed.success) return <LoadError title="Preview page" current={admin("/pages")} message={INVALID} />;
  return (
    <>
      <PreviewBanner state={state} editHref={admin(`/pages/${encodeURIComponent(slug)}`)} />
      <Render page={parsed.data as Record<string, unknown>} />
    </>
  );
}

/**
 * The whole admin behind one catch-all route. The site adds
 * `app/<basePath>/[[...gitms]]/page.tsx` that default-exports
 * `createAdmin({...})` and re-exports `generateMetadata` (see the README);
 * every screen is chosen here from the path, so new screens arrive with a
 * package update and no new files.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { ResolvedConfig } from "../config";
import type { AdminComponents } from "./components";
import { cms } from "../runtime";
import { HistoryView } from "./HistoryView";
import type { SearchParams } from "./views/common";
import { Activity } from "./views/Activity";
import { Dashboard } from "./views/Dashboard";
import { Login } from "./views/Login";
import { EditPage, NewPage, PageList } from "./views/Pages";
import { EditPost, NewPost, PostList } from "./views/Posts";
import { PreviewPage, PreviewPost } from "./views/Preview";
import { Redirects } from "./views/Redirects";
import { Section } from "./views/Section";

type Route = { readonly title: string; readonly render: (q: SearchParams) => ReactNode };

/** The screen for a path under the admin (`[]` is the dashboard), or null for a 404. */
export function route(c: ResolvedConfig, path: readonly string[], components: AdminComponents = {}): Route | null {
  const [a, b, d, ...rest] = path;
  if (rest.length) return null;
  if (a === undefined) return { title: "Dashboard", render: (q) => <Dashboard searchParams={q} /> };
  if (a === "login" && b === undefined) return { title: "Log in", render: () => <Login /> };

  if (a === "posts" && c.posts) {
    if (b === undefined) return { title: c.posts.label, render: (q) => <PostList searchParams={q} /> };
    if (b === "new" && d === undefined) return { title: "New post", render: () => <NewPost /> };
    if (d === undefined) return { title: "Edit post", render: (q) => <EditPost slug={b} searchParams={q} canPreview={!!components.preview?.post} /> };
    if (d === "history") return { title: "History", render: (q) => <HistoryView kind="posts" slug={b} params={q} /> };
    return null;
  }
  if (a === "pages" && c.pages) {
    if (b === undefined) return { title: c.pages.label, render: (q) => <PageList searchParams={q} /> };
    if (b === "new" && d === undefined) return { title: "New page", render: () => <NewPage /> };
    if (d === undefined) return { title: "Edit page", render: (q) => <EditPage slug={b} searchParams={q} canPreview={!!components.preview?.page} /> };
    if (d === "history") return { title: "History", render: (q) => <HistoryView kind="pages" slug={b} params={q} /> };
    return null;
  }
  if (a === "redirects" && c.redirects && b === undefined) return { title: "Redirects", render: (q) => <Redirects searchParams={q} /> };
  if (a === "activity" && c.activity && b === undefined) return { title: c.activity.label, render: (q) => <Activity searchParams={q} /> };
  if (a === "preview" && b !== undefined && d !== undefined) {
    const { post, page } = components.preview ?? {};
    if (b === "posts" && c.posts && post) return { title: "Preview post", render: () => <PreviewPost slug={d} render={post} /> };
    if (b === "pages" && c.pages && page) return { title: "Preview page", render: () => <PreviewPage slug={d} render={page} /> };
    return null;
  }
  const section = b === undefined ? c.sections.find((s) => s.slug === a) : undefined;
  const body = section && components.sections?.[section.slug];
  if (section && body) return { title: section.label, render: (q) => <Section section={section} body={body} searchParams={q} /> };
  return null;
}

const stub = () => null;
/** Pretends every optional component is there, for titles. */
const EVERYTHING: AdminComponents = { sections: new Proxy({}, { get: () => stub }), preview: { post: stub, page: stub } };

type Props = { params: Promise<{ gitms?: string[] }>; searchParams: Promise<SearchParams> };

// Next hands over path segments still URL-encoded.
const segments = (path: readonly string[] | undefined) =>
  (path ?? []).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

/**
 * The admin page, given the site's components. Default-export the result from
 * `app/<basePath>/[[...gitms]]/page.tsx`. Throws at startup when a configured
 * section has no component, so a typo can't ship a dead sidebar link.
 */
export function createAdmin(components: AdminComponents = {}) {
  const missing = cms().sections.filter((s) => !components.sections?.[s.slug]).map((s) => s.slug);
  if (missing.length) throw new Error(`gitms: no component for section${missing.length === 1 ? "" : "s"} ${missing.join(", ")} (pass them to createAdmin({ sections }))`);
  return async function GitmsAdmin({ params, searchParams }: Props) {
    const r = route(cms(), segments((await params).gitms), components);
    if (!r) notFound();
    return r.render(await searchParams);
  };
}

/** Admin pages are never indexed, cached by search engines or given share cards. */
export const ADMIN_ROBOTS: Metadata["robots"] = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

/** The page title (and noindex) for an admin path. Export it as `generateMetadata`. */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  // Titles come from the config alone; components only decide whether a screen exists.
  const r = route(cms(), segments((await params).gitms), EVERYTHING);
  return {
    title: { absolute: `${r?.title ?? "Not found"} · Admin` },
    robots: ADMIN_ROBOTS,
    alternates: { canonical: null },
    openGraph: null,
  };
}


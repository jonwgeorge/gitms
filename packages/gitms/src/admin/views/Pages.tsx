import Link from "next/link";
import { notFound } from "next/navigation";
import { routeFor } from "../../config";
import { initialState } from "../../core/drafts";
import { emptyPage, toPageDraft } from "../../core/page-draft";
import { pageViewHref } from "../../core/preview";
import { fingerprint } from "../../core/save";
import { admin, cms } from "../../runtime";
import { deletePage } from "../actions/pages";
import { AdminShell } from "../AdminShell";
import btn from "../Button.module.css";
import { DeleteZone } from "../DeleteZone";
import { Flash, repoOf } from "../Flash";
import { LoadError } from "../LoadError";
import { PageForm } from "../PageForm";
import styles from "../admin.module.css";
import { pageFormConfig, readList, signedIn, type SearchParams } from "./common";

export async function PageList({ searchParams }: { searchParams: SearchParams }) {
  const s = await signedIn();
  if ("page" in s) return s.page;
  const pagesConfig = cms().pages!;
  const loaded = await readList(s.store, "pages", "pages");
  if (!loaded.ok) return <LoadError title={pagesConfig.label} current={admin("/pages")} message={loaded.message} />;
  const pages = loaded.items.map((p) => ({ slug: String(p.slug ?? ""), title: String(p.title ?? ""), nav: p.nav === true, draft: p.draft === true }));

  return (
    <AdminShell
      title={pagesConfig.label}
      current={admin("/pages")}
      flash={<Flash params={searchParams} repo={repoOf(s.store)} />}
      actions={
        <Link href={admin("/pages/new")} className={`gitms-button ${btn.btn}`} data-variant="primary">
          New page
        </Link>
      }
    >
      <p className={`gitms-body ${styles.intro}`}>
        Standalone pages like <code>{routeFor(pagesConfig.route, "about")}</code>, written in markdown. Each lives at its own URL
        {pagesConfig.nav ? " and can be linked in the site's navigation" : ""}.
      </p>
      {pages.length === 0 ? (
        <p className={`gitms-body ${styles.empty}`}>
          No pages yet. <Link href={admin("/pages/new")}>Make one</Link>.
        </p>
      ) : (
        <table className={`gitms-body ${styles.table}`}>
          <thead className="gitms-label">
            <tr>
              <th scope="col">Title</th>
              <th scope="col">URL</th>
              {pagesConfig.nav ? <th scope="col">In nav</th> : null}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.slug}>
                <td>
                  <Link href={admin(`/pages/${encodeURIComponent(p.slug)}`)}>{p.title || p.slug}</Link>
                </td>
                <td className="gitms-code">{routeFor(pagesConfig.route, p.slug)}</td>
                {pagesConfig.nav ? <td className="gitms-small">{p.nav ? "Yes" : "No"}</td> : null}
                <td>
                  <span className={`gitms-label ${styles.badge}`} data-tone={p.draft ? "warn" : "ok"}>
                    {p.draft ? "Draft" : "Published"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}

export async function NewPage() {
  const s = await signedIn();
  if ("page" in s) return s.page;
  return (
    <AdminShell title="New page" current={admin("/pages")} crumbs={[{ href: admin("/pages"), label: cms().pages!.label }]}>
      <PageForm initial={initialState(emptyPage(), "")} config={pageFormConfig()} orig="" />
    </AdminShell>
  );
}

export async function EditPage({ slug, searchParams, canPreview }: { slug: string; searchParams: SearchParams; canPreview: boolean }) {
  const s = await signedIn();
  if ("page" in s) return s.page;
  const c = cms();
  const loaded = await readList(s.store, "pages", "pages");
  if (!loaded.ok) return <LoadError title="Edit page" current={admin("/pages")} message={loaded.message} />;
  const page = loaded.items.find((p) => p.slug === slug);
  if (!page) notFound();
  const draft = toPageDraft(page);
  const ver = fingerprint(page);
  const view = pageViewHref(c, page, canPreview);
  const url = routeFor(c.pages!.route, slug);

  return (
    <AdminShell
      title={draft.title || slug}
      current={admin("/pages")}
      crumbs={[{ href: admin("/pages"), label: c.pages!.label }]}
      flash={<Flash params={searchParams} repo={repoOf(s.store)} draft={draft.status === "draft"} />}
      actions={
        <>
          <a href={admin(`/pages/${encodeURIComponent(slug)}/history`)} className="gitms-small">
            History
          </a>
          {view ? (
            <a href={view} className="gitms-small">
              View on site ↗
            </a>
          ) : null}
        </>
      }
    >
      <PageForm initial={initialState(draft, ver)} config={pageFormConfig()} orig={slug} liveUrl={draft.status === "published" ? url : null} />
      <DeleteZone
        action={deletePage}
        fields={{ orig: slug, ver }}
        summary="Delete this page"
        detail={`${url} stops working after the next deploy. Git history keeps a copy.`}
        button="Delete page"
      />
    </AdminShell>
  );
}

import { inactiveReason, livePaths } from "../../core/redirects";
import { fingerprint } from "../../core/save";
import { admin, cms } from "../../runtime";
import { deleteRedirect } from "../actions/redirects";
import { AdminShell } from "../AdminShell";
import btn from "../Button.module.css";
import { Flash, repoOf } from "../Flash";
import { LoadError } from "../LoadError";
import { RedirectForm } from "../RedirectForm";
import styles from "../admin.module.css";
import { readList, signedIn, type SearchParams } from "./common";

export async function Redirects({ searchParams }: { searchParams: SearchParams }) {
  const s = await signedIn();
  if ("page" in s) return s.page;
  const c = cms();
  const [loaded, pages, posts] = await Promise.all([
    readList(s.store, "redirects", "redirects"),
    c.pages ? readList(s.store, "pages", "pages") : null,
    c.posts ? readList(s.store, "posts", "posts") : null,
  ]);
  if (!loaded.ok) return <LoadError title="Redirects" current={admin("/redirects")} message={loaded.message} />;

  const items = (list: Awaited<ReturnType<typeof readList>> | null) =>
    (list?.ok ? list.items : []).map((p) => ({ slug: String(p.slug ?? ""), draft: p.draft === true, body: String(p.body ?? ""), at: String(p.at ?? "") }));
  const live = livePaths(c, items(pages), items(posts));
  const redirects = loaded.items.map((r) => ({ from: String(r.from ?? ""), to: String(r.to ?? ""), permanent: r.permanent === true, ver: fingerprint(r) }));
  const builtIn = c.redirects!.builtIn;

  return (
    <AdminShell title="Redirects" current={admin("/redirects")} flash={<Flash params={searchParams} repo={repoOf(s.store)} />}>
      <p className={`gitms-body ${styles.intro}`}>
        Send an old URL somewhere new, so links to a renamed or removed page keep working. Renaming a published page or post offers
        one automatically. Changes go live with the next deploy.
      </p>
      <div className={styles.stack}>
        {redirects.length === 0 ? (
          <p className={`gitms-body ${styles.empty}`}>No redirects yet.</p>
        ) : (
          <table className={`gitms-body ${styles.table}`}>
            <thead className="gitms-label">
              <tr>
                <th scope="col">Old URL</th>
                <th scope="col">Redirects to</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {redirects.map((r) => {
                const reason = inactiveReason(r, live);
                return (
                  <tr key={r.from}>
                    <td className={`gitms-code ${styles.breakable}`}>{r.from}</td>
                    <td className={`gitms-code ${styles.breakable}`}>{r.to.startsWith("/") ? <a href={r.to}>{r.to}</a> : r.to}</td>
                    <td className="gitms-small">{r.permanent ? "Permanent" : "Temporary"}</td>
                    <td>
                      <span className={`gitms-label ${styles.badge}`} data-tone={reason ? "warn" : "ok"} title={reason ?? undefined}>
                        {reason ? "Skipped" : "Active"}
                      </span>
                      {reason ? <p className={`gitms-small ${styles.hint}`}>{reason}.</p> : null}
                    </td>
                    <td>
                      <form action={deleteRedirect}>
                        <input type="hidden" name="from" value={r.from} />
                        <input type="hidden" name="ver" value={r.ver} />
                        <button type="submit" className={`gitms-button ${btn.btn} ${styles.button} ${styles.danger}`}>
                          Delete <span className="visually-hidden">redirect from {r.from}</span>
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <RedirectForm />
        {builtIn.length ? (
          <details className={styles.section}>
            <summary className="gitms-body">Built-in redirects ({builtIn.length})</summary>
            <p className={`gitms-small ${styles.hint}`}>Kept in the site&apos;s code. A redirect added above for the same URL takes over.</p>
            <ul className={`gitms-code ${styles.plainList}`}>
              {builtIn.map((r) => (
                <li key={r.source}>
                  {r.label ?? r.source} → {r.destination} <span className={`gitms-small ${styles.muted}`}>({r.permanent ? "permanent" : "temporary"})</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </AdminShell>
  );
}

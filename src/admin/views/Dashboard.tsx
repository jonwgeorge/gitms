import Link from "next/link";
import { postStatus } from "../../core/redirects";
import { attempt, type LastCommit } from "../../core/store";
import { admin, cms } from "../../runtime";
import { AdminShell } from "../AdminShell";
import btn from "../Button.module.css";
import styles from "../admin.module.css";
import { postDate } from "../format";
import { plural, readList, signedIn } from "./common";

const counts = (items: Record<string, unknown>[]) => {
  const drafts = items.filter((p) => p.draft === true).length;
  return `${items.length - drafts} published · ${plural(drafts, "draft")}`;
};

/** The admin home: a tile per section, the newest posts and where saves go. */
export async function Dashboard() {
  const s = await signedIn();
  if ("page" in s) return s.page;
  const c = cms();
  const [postsFile, pagesFile, redirectsFile, commit] = await Promise.all([
    c.posts ? readList(s.store, "posts", "posts") : null,
    c.pages ? readList(s.store, "pages", "pages") : null,
    c.redirects ? readList(s.store, "redirects", "redirects") : null,
    attempt(() => s.store.lastCommit()),
  ]);
  const posts = postsFile?.ok ? [...postsFile.items].sort((a, b) => Date.parse(String(b.at)) - Date.parse(String(a.at))) : [];
  const last: LastCommit | null = commit.ok ? commit.value : null;

  return (
    <AdminShell
      title="Dashboard"
      current={admin()}
      actions={
        c.posts ? (
          <Link href={admin("/posts/new")} className={`gitms-button ${btn.btn}`} data-variant="primary">
            New post
          </Link>
        ) : null
      }
    >
      <div className={styles.tiles}>
        {c.posts && postsFile ? (
          <section className={styles.tile} aria-labelledby="tile-posts">
            <h2 id="tile-posts" className="gitms-h2">
              {c.posts.label}
            </h2>
            <p className="gitms-body">{postsFile.ok ? counts(postsFile.items) : "Couldn't load posts."}</p>
            <div className={`gitms-small ${styles.tileLinks}`}>
              <Link href={admin("/posts")}>All posts</Link>
              <Link href={admin("/posts/new")}>Write a post</Link>
            </div>
          </section>
        ) : null}
        {c.pages && pagesFile ? (
          <section className={styles.tile} aria-labelledby="tile-pages">
            <h2 id="tile-pages" className="gitms-h2">
              {c.pages.label}
            </h2>
            <p className="gitms-body">{pagesFile.ok ? counts(pagesFile.items) : "Couldn't load pages."}</p>
            <div className={`gitms-small ${styles.tileLinks}`}>
              <Link href={admin("/pages")}>All pages</Link>
              <Link href={admin("/pages/new")}>New page</Link>
            </div>
          </section>
        ) : null}
        {c.redirects && redirectsFile ? (
          <section className={styles.tile} aria-labelledby="tile-redirects">
            <h2 id="tile-redirects" className="gitms-h2">
              Redirects
            </h2>
            <p className="gitms-body">{redirectsFile.ok ? plural(redirectsFile.items.length, "redirect") : "Couldn't load redirects."}</p>
            <div className={`gitms-small ${styles.tileLinks}`}>
              <Link href={admin("/redirects")}>Manage redirects</Link>
            </div>
          </section>
        ) : null}
        {c.sections.map((section) => (
          <section key={section.slug} className={styles.tile} aria-labelledby={`tile-${section.slug}`}>
            <h2 id={`tile-${section.slug}`} className="gitms-h2">
              {section.label}
            </h2>
            <div className={`gitms-small ${styles.tileLinks}`}>
              <Link href={admin(`/${section.slug}`)}>Edit {section.label}</Link>
            </div>
          </section>
        ))}
      </div>

      {c.posts ? (
        <section className={styles.panel} aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="gitms-h2">
            Recent posts
          </h2>
          {posts.length ? (
            <table className={`gitms-body ${styles.table}`}>
              <tbody>
                {posts.slice(0, 5).map((p) => (
                  <tr key={String(p.slug)}>
                    <td>
                      <Link href={admin(`/posts/${encodeURIComponent(String(p.slug))}`)}>{String(p.title)}</Link>
                    </td>
                    <td className={`gitms-small ${styles.num}`}>{postDate(String(p.at))}</td>
                    <td>
                      <span className={`gitms-label ${styles.badge}`} data-tone={postStatus(p).tone}>
                        {postStatus(p).label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={`gitms-body ${styles.muted}`}>No posts yet.</p>
          )}
        </section>
      ) : null}

      <section className={styles.panel} aria-labelledby="store-heading">
        <h2 id="store-heading" className="gitms-h2">
          Publishing
        </h2>
        <dl className={`gitms-body ${styles.facts}`}>
          <dt>Saves go to</dt>
          <dd>
            <code>{s.store.target}</code> ({s.store.kind} store)
          </dd>
          <dt>Last change</dt>
          <dd>
            {!commit.ok ? (
              "Couldn't load the last commit."
            ) : last ? (
              <>
                {last.url ? (
                  <a href={last.url} rel="noopener noreferrer">
                    {last.message}
                  </a>
                ) : (
                  last.message
                )}
                {last.date ? (
                  <>
                    {" · "}
                    <time dateTime={last.date}>{last.date.replace("T", " ").slice(0, 16)} UTC</time>
                  </>
                ) : null}
              </>
            ) : (
              "None yet"
            )}
          </dd>
          <dt>Going live</dt>
          <dd>Each save is a commit; your host rebuilds and deploys the site from it.</dd>
        </dl>
      </section>
    </AdminShell>
  );
}

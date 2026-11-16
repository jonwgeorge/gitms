import Link from "next/link";
import { notFound } from "next/navigation";
import { routeFor } from "../../config";
import { initialState } from "../../core/drafts";
import { emptyPost, toPostDraft, usedValues } from "../../core/post-draft";
import { postViewHref } from "../../core/preview";
import { livePostUrl, postStatus } from "../../core/redirects";
import { fingerprint } from "../../core/save";
import { matchesSearch } from "../../core/search";
import { admin, cms } from "../../runtime";
import { deletePost } from "../actions/posts";
import { AdminShell } from "../AdminShell";
import btn from "../Button.module.css";
import { DeleteZone } from "../DeleteZone";
import { Flash, repoOf } from "../Flash";
import { LoadError } from "../LoadError";
import { PostForm } from "../PostForm";
import styles from "../admin.module.css";
import { postDate } from "../format";
import { one, postFieldsConfig, postFormConfig, readList, signedIn, type SearchParams } from "./common";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "scheduled", label: "Scheduled" },
  { key: "drafts", label: "Drafts" },
] as const;

/** Text fields that show as a column in the list (and are searched): the first two. */
const listedFields = () =>
  Object.entries(cms().posts!.fields)
    .slice(0, 2)
    .map(([name, f]) => ({ name, label: f.label }));

/** The values to suggest for each text field that asks for suggestions. */
function suggestionsFor(data: unknown): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(cms().posts!.fields)
      .filter(([, f]) => f.type === "text" && f.suggest)
      .map(([name]) => [name, usedValues(data, name)]),
  );
}

export async function PostList({ searchParams }: { searchParams: SearchParams }) {
  const s = await signedIn();
  if ("page" in s) return s.page;
  const posts = cms().posts!;
  const loaded = await readList(s.store, "posts", "posts");
  if (!loaded.ok) return <LoadError title={posts.label} current={admin("/posts")} message={loaded.message} />;

  const columns = listedFields();
  const all = [...loaded.items].sort((a, b) => Date.parse(String(b.at)) - Date.parse(String(a.at)));
  const showParam = one(searchParams.show);
  const show = FILTERS.some((f) => f.key === showParam) ? showParam : "all";
  const q = one(searchParams.q).trim().slice(0, 100);
  const found = q ? all.filter((p) => matchesSearch(p, q, columns.map((c) => c.name))) : all;
  // The filter keys match postStatus labels; "all" matches everything.
  const inTab = (key: string) => found.filter((p) => key === "all" || postStatus(p).label.toLowerCase() === (key === "drafts" ? "draft" : key));
  const shown = inTab(show);
  const tabHref = (key: string) => {
    const query = new URLSearchParams();
    if (key !== "all") query.set("show", key);
    if (q) query.set("q", q);
    return admin(`/posts${query.size ? `?${query}` : ""}`);
  };
  const clearHref = show === "all" ? admin("/posts") : admin(`/posts?show=${show}`);
  const example = posts.route.replace(":slug", "…");

  return (
    <AdminShell
      title={posts.label}
      current={admin("/posts")}
      flash={<Flash params={searchParams} repo={repoOf(s.store)} />}
      actions={
        <Link href={admin("/posts/new")} className={`gitms-button ${btn.btn}`} data-variant="primary">
          New post
        </Link>
      }
    >
      <p className={`gitms-body ${styles.intro}`}>
        Each post with a body gets its own page at <code>{example}</code>. A post with only a title is a short entry with no page of its own.
      </p>
      <form method="get" action={admin("/posts")} role="search" className={styles.search}>
        {show !== "all" ? <input type="hidden" name="show" value={show} /> : null}
        <div className={styles.field}>
          <label htmlFor="f-q" className={`gitms-label ${styles.label}`}>
            Search posts
          </label>
          <input id="f-q" type="search" name="q" defaultValue={q} placeholder="Title or slug" className={`gitms-body ${styles.input}`} autoComplete="off" spellCheck={false} />
        </div>
        <button type="submit" className={`gitms-button ${btn.btn} ${styles.button}`}>
          Search
        </button>
        {q ? (
          <a href={clearHref} className="gitms-small">
            Clear search
          </a>
        ) : null}
      </form>
      <nav aria-label="Filter posts">
        <ul className={`gitms-small ${styles.tabs}`}>
          {FILTERS.map((f) => (
            <li key={f.key}>
              <a href={tabHref(f.key)} aria-current={show === f.key ? "page" : undefined}>
                {f.label} ({inTab(f.key).length})
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {shown.length === 0 ? (
        <p className={`gitms-body ${styles.empty}`}>
          {q ? (
            <>
              No posts match “{q}”{show === "all" ? "" : ` in ${show}`}. <a href={clearHref}>Clear search</a>.
            </>
          ) : (
            <>
              {show === "drafts" ? "No drafts." : show === "scheduled" ? "Nothing scheduled." : "No posts yet."} <Link href={admin("/posts/new")}>Write one</Link>.
            </>
          )}
        </p>
      ) : (
        <table className={`gitms-body ${styles.table}`}>
          <thead className="gitms-label">
            <tr>
              <th scope="col">Title</th>
              {columns.map((c) => (
                <th key={c.name} scope="col">
                  {c.label}
                </th>
              ))}
              <th scope="col">Date</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const slug = String(p.slug ?? "");
              const hasBody = typeof p.body === "string" && p.body.trim() !== "";
              return (
                <tr key={slug}>
                  <td>
                    <Link href={admin(`/posts/${encodeURIComponent(slug)}`)}>{String(p.title ?? "") || slug}</Link>
                    {hasBody ? null : <span className={`gitms-small ${styles.muted}`}> · no body</span>}
                  </td>
                  {columns.map((c) => (
                    <td key={c.name} className="gitms-code">
                      {typeof p[c.name] === "string" ? String(p[c.name]) : ""}
                    </td>
                  ))}
                  <td className={`gitms-small ${styles.num}`}>
                    <time dateTime={String(p.at ?? "")}>{postDate(String(p.at ?? ""))}</time>
                  </td>
                  <td>
                    <span className={`gitms-label ${styles.badge}`} data-tone={postStatus(p).tone}>
                      {postStatus(p).label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}

export async function NewPost() {
  const s = await signedIn();
  if ("page" in s) return s.page;
  const c = cms();
  const loaded = await readList(s.store, "posts", "posts");
  return (
    <AdminShell title="New post" current={admin("/posts")} crumbs={[{ href: admin("/posts"), label: c.posts!.label }]}>
      <PostForm initial={initialState(emptyPost(postFieldsConfig()), "")} config={postFormConfig()} orig="" suggestions={loaded.ok ? suggestionsFor(loaded.data) : {}} />
    </AdminShell>
  );
}

export async function EditPost({ slug, searchParams, canPreview }: { slug: string; searchParams: SearchParams; canPreview: boolean }) {
  const s = await signedIn();
  if ("page" in s) return s.page;
  const c = cms();
  const loaded = await readList(s.store, "posts", "posts");
  if (!loaded.ok) return <LoadError title="Edit post" current={admin("/posts")} message={loaded.message} />;
  const post = loaded.items.find((p) => p.slug === slug);
  if (!post) notFound();
  const draft = toPostDraft(post, postFieldsConfig());
  const ver = fingerprint(post);
  const view = postViewHref(c, post, canPreview);

  return (
    <AdminShell
      title={draft.title || slug}
      current={admin("/posts")}
      crumbs={[{ href: admin("/posts"), label: c.posts!.label }]}
      flash={<Flash params={searchParams} repo={repoOf(s.store)} draft={post.draft === true} />}
      actions={
        <>
          <a href={admin(`/posts/${encodeURIComponent(slug)}/history`)} className="gitms-small">
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
      <PostForm initial={initialState(draft, ver)} config={postFormConfig()} orig={slug} suggestions={suggestionsFor(loaded.data)} liveUrl={livePostUrl(c, post)} />
      <DeleteZone
        action={deletePost}
        fields={{ orig: slug, ver }}
        summary="Delete this post"
        detail={`${routeFor(c.posts!.route, slug)} stops working after the next deploy. Git history keeps a copy.`}
        button="Delete post"
      />
    </AdminShell>
  );
}

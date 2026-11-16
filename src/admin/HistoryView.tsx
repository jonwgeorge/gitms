import { notFound, redirect } from "next/navigation";
import btn from "./Button.module.css";
import { restoreVersion } from "./actions/history";
import { AdminShell } from "./AdminShell";
import { Flash, repoOf, type FlashParams } from "./Flash";
import { LoadError } from "./LoadError";
import { NotConfigured } from "./NotConfigured";
import styles from "./admin.module.css";
import { adminGate } from "../core/auth";
import { HISTORY_DEPTH, HISTORY_KINDS, itemHistory, itemIn, type HistoryKind, type Version } from "../core/history";
import { fingerprint } from "../core/save";
import { postDate } from "./format";
import { attempt, createStore } from "../core/store";
import { admin, cms } from "../runtime";

const FIELD_NAMES: Record<string, string> = { at: "date", nav: "header link", shareImage: "share image" };
const fieldName = (k: string) => FIELD_NAMES[k] ?? k;

/** `Nov 14, 2026 · 21:14 UTC` from a commit's ISO date. */
function when(iso: string | null): string {
  if (!iso) return "Unknown date";
  const time = /T(\d{2}:\d{2})/.exec(iso)?.[1];
  return time ? `${postDate(iso)} · ${time}${iso.endsWith("Z") ? " UTC" : ""}` : postDate(iso);
}

const shown = (v: unknown) => (typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v));

type Props = { kind: HistoryKind; slug: string; params: FlashParams };

/** The history page of one post or page: its past versions, each with a restore button. */
export async function HistoryView({ kind, slug, params }: Props) {
  const gate = await adminGate();
  if (gate.state === "unconfigured") return <NotConfigured missing={gate.missing} />;
  if (gate.state === "anonymous") redirect(admin("/login"));

  const { file, list, noun } = HISTORY_KINDS[kind];
  const section = admin(HISTORY_KINDS[kind].section);
  const store = createStore(cms(), gate.config.store);
  const loaded = await attempt(() => store.read(file));
  if (!loaded.ok) return <LoadError title="History" current={section} message={loaded.message} />;
  const now = itemIn(loaded.value.data, list, slug);
  if (!now) notFound();
  const ver = fingerprint(now);
  const title = String(now.title ?? "") || slug;
  const editHref = `${section}/${encodeURIComponent(slug)}`;
  const crumbs = [
    { href: section, label: (kind === "posts" ? cms().posts?.label : cms().pages?.label) ?? noun },
    { href: editHref, label: title },
  ];
  const shell = (body: React.ReactNode) => (
    <AdminShell title="History" current={section} crumbs={crumbs} flash={<Flash params={params} repo={repoOf(store)} />}>
      {body}
    </AdminShell>
  );

  if (store.kind === "fs") {
    return shell(<p className={`gitms-body ${styles.empty}`}>The local file store keeps no history. Version history works on a GitHub store, where every save is a Git commit.</p>);
  }

  const history = await attempt(() => itemHistory(store, kind, slug, now));
  if (!history.ok) return <LoadError title="History" current={section} message={history.message} />;
  const { versions, truncated } = history.value;

  return shell(
    <div className={styles.stack}>
      <p className={`gitms-body ${styles.muted}`}>
        Every save of this {noun} is a Git commit. Restoring a version saves it as a new commit, so the version you replace stays in this list.
      </p>
      {versions.length === 0 ? (
        <p className={`gitms-body ${styles.empty}`}>No saved versions found in the last {HISTORY_DEPTH} commits.</p>
      ) : (
        <ol className={styles.versions}>
          {versions.map((v) => (
            <VersionRow key={v.commit.sha} kind={kind} slug={slug} ver={ver} version={v} />
          ))}
        </ol>
      )}
      {truncated ? (
        <p className={`gitms-small ${styles.muted}`}>
          Showing changes from the last {HISTORY_DEPTH} commits to this file. Older versions are in the Git history on GitHub.
        </p>
      ) : null}
    </div>,
  );
}

function VersionRow({ kind, slug, ver, version: v }: { kind: HistoryKind; slug: string; ver: string; version: Version }) {
  const short = v.commit.sha.slice(0, 7);
  return (
    <li className={styles.section}>
      <div className={styles.versionHead}>
        <p className="gitms-body">
          <strong>{when(v.commit.date)}</strong>
          {v.current ? (
            <>
              {" "}
              <span className={`gitms-label ${styles.badge}`} data-tone="ok">
                Current
              </span>
            </>
          ) : null}
        </p>
        <p className={`gitms-small ${styles.muted}`}>
          {v.commit.message}
          {" · "}
          {v.commit.url ? (
            <a href={v.commit.url} rel="noopener noreferrer" className="gitms-code">
              {short}
            </a>
          ) : (
            <span className="gitms-code">{short}</span>
          )}
        </p>
      </div>
      {v.current ? null : (
        <p className="gitms-small">
          {v.changed.length ? <>Differs from now in: {v.changed.map(fieldName).join(", ")}.</> : "Same content as now, stored differently."}
        </p>
      )}
      <details className={styles.versionBody}>
        <summary className="gitms-small">Show this version</summary>
        <dl className={`gitms-small ${styles.facts}`}>
          {Object.entries(v.item)
            .filter(([k]) => k !== "body")
            .map(([k, value]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{fieldName(k)}</dt>
                <dd>{shown(value)}</dd>
              </div>
            ))}
        </dl>
        {typeof v.item.body === "string" && v.item.body ? <pre className={`gitms-code ${styles.versionText}`}>{v.item.body}</pre> : null}
      </details>
      {v.current ? null : (
        <form action={restoreVersion}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="commit" value={v.commit.sha} />
          <input type="hidden" name="ver" value={ver} />
          <button type="submit" className={`gitms-button ${btn.btn} ${styles.button}`}>
            Restore this version
          </button>
        </form>
      )}
    </li>
  );
}

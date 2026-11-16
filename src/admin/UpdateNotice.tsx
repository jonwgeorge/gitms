import { GITMS_SOURCE, type UpdateStatus } from "../core/updates";
import { checkGitmsNow, updateGitmsNow } from "./actions/updates";
import btn from "./Button.module.css";
import { FlashClear } from "./FlashClear";
import styles from "./admin.module.css";

/** What the last "Update now" did, from `?update=…`. Only known codes are shown. */
const OUTCOME: Record<string, { kind: "saved" | "error"; title: string; text: string }> = {
  started: {
    kind: "saved",
    title: "Update started",
    text: "Your site's Update gitms workflow is moving it to the newest gitms. If the site's checks pass, it commits the update and your host redeploys, usually within a few minutes. If they fail, nothing changes and GitHub emails you.",
  },
  local: { kind: "error", title: "Not started", text: "This admin saves to local files, so there's no site workflow to start. Run npm install github:jonwgeorge/gitms#main to update." },
  denied: { kind: "error", title: "Not started", text: "GitHub refused. The site's GitHub token needs Contents: read and write on the site's repository." },
  unreachable: { kind: "error", title: "Not started", text: "Couldn't reach GitHub. Try again in a minute." },
  repo: { kind: "error", title: "Not started", text: "GITMS_GITHUB_REPO must look like owner/name." },
  failed: { kind: "error", title: "Not started", text: "GitHub didn't accept the request. Try again later, or run Update gitms from the site's Actions tab." },
};

const short = (sha: string) => sha.slice(0, 7);
const commitLink = (sha: string) => (
  <a href={`https://github.com/${GITMS_SOURCE.repo}/commit/${sha}`} rel="noopener noreferrer">
    <code>{short(sha)}</code>
  </a>
);
const checkedAt = (iso: string) => <time dateTime={iso}>{iso.replace("T", " ").slice(0, 16)} UTC</time>;

function CheckAgain() {
  return (
    <form action={checkGitmsNow} className={styles.inlineForm}>
      <button type="submit" className={`gitms-button ${btn.btn}`}>
        Check again
      </button>
    </form>
  );
}

/**
 * The dashboard's gitms update notice: a panel with the new changes and an
 * "Update now" button when the site is behind, else nothing (the version
 * shows in the Publishing panel via `GitmsVersion`).
 */
export function UpdateNotice({ status, outcome, actionsUrl }: { status: UpdateStatus; outcome?: string; actionsUrl: string | null }) {
  const done = outcome && Object.hasOwn(OUTCOME, outcome) ? OUTCOME[outcome] : null;
  return (
    <>
      {done ? (
        <FlashClear>
          <div className={`gitms-body ${styles.status} ${styles.flash}`} data-kind={done.kind} role={done.kind === "error" ? "alert" : "status"}>
            <p className={`gitms-label ${styles.statusTitle}`} data-kind={done.kind}>
              {done.title}
            </p>
            <p>
              {done.text}
              {outcome === "started" && actionsUrl ? (
                <>
                  {" "}
                  <a href={actionsUrl} rel="noopener noreferrer">
                    Follow it on GitHub
                  </a>
                  .
                </>
              ) : null}
            </p>
          </div>
        </FlashClear>
      ) : null}
      {status.state === "available" ? (
        <section className={`${styles.panel} ${styles.update}`} aria-labelledby="update-heading">
          <h2 id="update-heading" className="gitms-h2">
            A new version of gitms is available
          </h2>
          <p className="gitms-body">
            This site runs {commitLink(status.installed)}; gitms has {status.behind === 1 ? "1 newer change" : `${status.behind} newer changes`} up to {commitLink(status.latest)}.
          </p>
          {status.changes.length ? (
            <ul className={`gitms-small ${styles.changes}`}>
              {status.changes.map((c) => (
                <li key={c.sha}>
                  <a href={c.url} rel="noopener noreferrer">
                    <code>{short(c.sha)}</code>
                  </a>{" "}
                  {c.message}
                </li>
              ))}
              {status.behind > status.changes.length ? (
                <li className={styles.muted}>
                  <a href={`https://github.com/${GITMS_SOURCE.repo}/compare/${status.installed}...${status.latest}`} rel="noopener noreferrer">
                    and {status.behind - status.changes.length} more
                  </a>
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className={styles.updateActions}>
            <form action={updateGitmsNow} className={styles.inlineForm}>
              <input type="hidden" name="latest" value={status.latest} />
              <button type="submit" className={`gitms-button ${btn.btn}`} data-variant="primary">
                Update now
              </button>
            </form>
            <CheckAgain />
          </div>
          <p className={`gitms-small ${styles.muted}`}>Otherwise the site updates itself in its daily run. Checked {checkedAt(status.checkedAt)}.</p>
        </section>
      ) : null}
    </>
  );
}

/** One line for the Publishing panel: which gitms this site runs and whether it's the newest. */
export function GitmsVersion({ status }: { status: UpdateStatus }) {
  let text;
  if (status.state === "current") text = <>{commitLink(status.installed)}, up to date</>;
  else if (status.state === "available") text = <>{commitLink(status.installed)}, {status.behind === 1 ? "1 change" : `${status.behind} changes`} behind</>;
  else if (status.state === "unknown") text = <>not recorded in this build (newest is {commitLink(status.latest)})</>;
  else if (status.state === "error") text = <>{status.message}</>;
  return (
    <>
      {text} · checked {checkedAt(status.checkedAt)} {status.state === "available" ? null : <CheckAgain />}
    </>
  );
}

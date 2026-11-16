import { DRAFT_NOTE } from "../core/drafts";
import { FlashClear } from "./FlashClear";
import styles from "./admin.module.css";

/** What a redirect after a save reports: `?done=…&commit=…` or `?error=…`. */
export type FlashParams = { done?: string | string[]; commit?: string | string[]; error?: string | string[] };

const DONE: Record<string, string> = {
  created: "Created.",
  saved: "Saved.",
  deleted: "Deleted.",
  restored: "Restored.",
  added: "Added.",
  removed: "Removed.",
  updated: "Updated.",
  renamed: "Saved. The old URL now redirects here.",
  "renamed-noredirect": "Saved, but the redirect from the old URL couldn't be added. Add it under Redirects.",
};

const ERRORS: Record<string, string> = {
  stale: "Someone (or another tab) changed this since you opened the page, so nothing was saved. Here is the latest version; redo your change.",
  missing: "That item no longer exists. Nothing was saved.",
  invalid: "That change would make the content invalid. Nothing was saved.",
  store: "Saving failed. Nothing was saved.",
  denied: "Your session expired. Log in again; nothing was saved.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The outcome of the last action (`draft` when the item shown is a draft, so
 * the note doesn't promise it goes live), from the query string. Only known codes are
 * shown, and the commit link is built here from the configured repo (never from
 * the URL), so the query string can't inject text or links.
 */
export function Flash({ params, repo, draft = false }: { params: FlashParams; repo: string | null; draft?: boolean }) {
  const done = one(params.done);
  const error = one(params.error);
  const commit = one(params.commit);
  const sha = commit && /^[0-9a-f]{7,40}$/.test(commit) ? commit : null;
  if (error && Object.hasOwn(ERRORS, error)) {
    return (
      <FlashClear>
        <div className={`gitms-body ${styles.status}`} data-kind="error" role="alert">
          <p className={`gitms-label ${styles.statusTitle}`} data-kind="error">
            Not saved
          </p>
          <p>{ERRORS[error]}</p>
        </div>
      </FlashClear>
    );
  }
  if (!done || !Object.hasOwn(DONE, done)) return null;
  return (
    <FlashClear>
      <div className={`gitms-body ${styles.status}`} data-kind="saved" role="status">
        <p className={`gitms-label ${styles.statusTitle}`} data-kind="saved">
          {DONE[done]}
        </p>
        <p>
          {sha && repo ? (
            <>
              Committed{" "}
              <a href={`https://github.com/${repo}/commit/${sha}`} rel="noopener noreferrer">
                {sha.slice(0, 7)}
              </a>
              . {draft ? DRAFT_NOTE : "Live once your site rebuilds from the commit."}
            </>
          ) : sha === null && repo ? (
            draft ? DRAFT_NOTE : "Live once your site rebuilds from the commit."
          ) : (
            "Written to the local content files: reload the dev site to see it."
          )}
        </p>
      </div>
    </FlashClear>
  );
}

/** The GitHub repo saves go to, or null for the local fs store. */
export function repoOf(store: { kind: "github" | "fs"; target: string }): string | null {
  return store.kind === "github" ? store.target.split("@")[0] : null;
}

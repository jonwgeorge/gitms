import { postDate } from "./format";
import type { PreviewState } from "../core/preview";
import styles from "./PreviewBanner.module.css";
import theme from "./theme.module.css";

/** The strip across an admin preview: what state the item is in and who can see it. */
export function PreviewBanner({ state, editHref }: { state: PreviewState; editHref: string }) {
  return (
    <aside className={`${theme.root} gitms-root gitms-code ${styles.banner}`} aria-label="preview">
      {state.kind === "draft" ? (
        <>
          <span className={styles.state}>draft</span>
          <span>only you can see this. it isn&apos;t on the site.</span>
        </>
      ) : (
        <>
          <span className={styles.state}>scheduled</span>
          <span>
            goes live <time dateTime={state.at}>{postDate(state.at)}</time>. only you can see it until then.
          </span>
        </>
      )}
      <a className={styles.edit} href={editHref}>
        ← back to editor
      </a>
    </aside>
  );
}

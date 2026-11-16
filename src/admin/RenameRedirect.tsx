import styles from "./admin.module.css";

type Props = {
  /** The item's public URL as stored, or null when it has none (a draft, or a post without a body). */
  liveUrl: string | null;
  /** The URL it will have after the save. */
  next: string;
  /** Whether the slug field now differs from the stored slug. */
  changed: boolean;
};

/**
 * Shown under the slug once it is changed on a live page or post: a ticked box
 * that leaves a redirect from the old URL to the new one when the save goes through.
 */
export function RenameRedirect({ liveUrl, next, changed }: Props) {
  if (!liveUrl || !changed) return null;
  return (
    <div className={styles.choices} data-testid="rename-redirect">
      <label className={`gitms-body ${styles.breakable}`} htmlFor="f-redirect">
        <input id="f-redirect" type="checkbox" name="redirect" defaultChecked />
        <span>
          Redirect <code>{liveUrl}</code> to <code>{next}</code>
        </span>
      </label>
      <p className={`gitms-small ${styles.hint}`}>Keeps old links working. You can remove it later under Redirects.</p>
    </div>
  );
}

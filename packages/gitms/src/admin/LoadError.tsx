import { AdminShell } from "./AdminShell";
import styles from "./admin.module.css";

/** The content couldn't be read from the store; nothing to edit. */
export function LoadError({ title, current, message }: { title: string; current: string; message: string | null }) {
  return (
    <AdminShell title={title} current={current}>
      <div className={`gitms-body ${styles.status}`} data-kind="error" role="alert">
        <p>Couldn&apos;t load the content{message ? `: ${message}` : ""}. Reload to try again.</p>
      </div>
    </AdminShell>
  );
}

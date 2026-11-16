import { AdminShell } from "./AdminShell";
import styles from "./admin.module.css";

/** Shown on every admin page when the env is incomplete. Nothing can be saved. */
export function NotConfigured({ missing }: { missing: readonly string[] }) {
  return (
    <AdminShell title="Admin not configured">
      <div className={styles.panel} role="status">
        <p className="gitms-body">
          The admin is not configured on this server, so login and saving are turned off. Set these environment variables
          (each may also be written with a <code>GITMS_</code> prefix), then restart or redeploy.
        </p>
        {missing.length ? (
          <>
            <p className="gitms-body">Missing or invalid:</p>
            <ul className="gitms-code">
              {missing.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}

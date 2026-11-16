import btn from "./Button.module.css";
import styles from "./admin.module.css";

type Props = {
  action: (fd: FormData) => Promise<void>;
  /** Hidden fields the action needs (the item's key and fingerprint). */
  fields: Record<string, string>;
  summary: string;
  detail: string;
  button: string;
};

/** A delete that takes two clicks: open the panel, then confirm. Works without JS. */
export function DeleteZone({ action, fields, summary, detail, button }: Props) {
  return (
    <details className={`${styles.section} ${styles.dangerZone}`} style={{ marginTop: "var(--space-5)" }}>
      <summary className="gitms-body">{summary}…</summary>
      <form action={action} className={styles.stack}>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <p className="gitms-body">{detail}</p>
        <div>
          <button type="submit" className={`gitms-button ${btn.btn} ${styles.button} ${styles.danger}`}>
            {button}
          </button>
        </div>
      </form>
    </details>
  );
}

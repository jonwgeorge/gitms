import type { MouseEvent, ReactNode } from "react";
import btn from "./Button.module.css";
import { buttonId } from "../core/drafts";
import styles from "./admin.module.css";

type Props = {
  /** `save`, `add:<list>`, `up:<list>:<i>` … (see parseIntent). */
  intent: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  /** Hover tooltip, e.g. for an icon-only button. */
  title?: string;
  /** With JS, handle the button on the client (call preventDefault to skip the server round trip). */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
};

/** A submit button carrying an intent; works without JS (the browser sends name/value). */
export function Submit({ intent, children, variant = "secondary", danger, disabled, className, title, onClick }: Props) {
  const [op, list, index] = intent.split(":");
  const id = op === "save" ? undefined : buttonId(op, list ?? "", index === undefined || op === "add" ? undefined : Number(index));
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      id={id}
      disabled={disabled}
      title={title}
      onClick={onClick}
      data-variant={variant}
      className={`gitms-button ${btn.btn} ${styles.button} ${danger ? styles.danger : ""} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Up / down / delete for one row. `what` names the row for screen readers. */
export function RowActions({ list, index, what, disabled }: { list: string; index: number; what: string; disabled?: boolean }) {
  return (
    <div className={styles.rowActions}>
      <Submit intent={`up:${list}:${index}`} disabled={disabled}>
        {"Move up "}
        <span className="visually-hidden">{what}</span>
      </Submit>
      <Submit intent={`down:${list}:${index}`} disabled={disabled}>
        {"Move down "}
        <span className="visually-hidden">{what}</span>
      </Submit>
      <Submit intent={`del:${list}:${index}`} danger disabled={disabled}>
        {"Delete "}
        <span className="visually-hidden">{what}</span>
      </Submit>
    </div>
  );
}

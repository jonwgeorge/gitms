import styles from "./Led.module.css";

export type LedState = "on" | "warn" | "off" | "fault";

/** A 7px status LED. Decoration only: the status is always written as text beside it. */
export function Led({ state }: { state: LedState }) {
  return <span className={styles.led} data-led={state} aria-hidden="true" />;
}

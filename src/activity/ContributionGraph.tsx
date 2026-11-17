import type { ReactNode } from "react";
import { calendarWeeks, dayLabel, type Contributions } from "../core/activity";
import styles from "./ContributionGraph.module.css";

type Props = {
  readonly data: Contributions;
  /** Read out instead of the cells. Defaults to "<total> contributions in the last year". */
  readonly label?: string;
  /** Shown under the graph on the left, e.g. a link to the profile. */
  readonly footer?: ReactNode;
  /** Words either side of the legend. Defaults to "Less" and "More"; pass null to leave the legend out. */
  readonly legend?: readonly [string, string] | null;
  readonly className?: string;
};

const DAY_NAMES = ["", "Mon", "", "Wed", "", "Fri", ""];

/**
 * A GitHub-style contribution heat map: week columns, Sunday on top, month
 * names above, shaded by GitHub's own levels. Pure HTML and CSS, no client
 * JavaScript. Narrow screens scroll it sideways, starting at the newest week.
 *
 * Style it with custom properties on it or a parent:
 * --gitms-activity-0 … --gitms-activity-4 (cell colours), --gitms-activity-cell
 * (size), --gitms-activity-gap, --gitms-activity-radius; the classes
 * gitms-activity, gitms-activity-cell (with data-level) and
 * gitms-activity-label are stable hooks too.
 */
export function ContributionGraph({ data, label, footer, legend = ["Less", "More"], className }: Props) {
  const weeks = calendarWeeks(data.days);
  const summary = label ?? `${data.total.toLocaleString("en-US")} contribution${data.total === 1 ? "" : "s"} in the last year`;
  return (
    <div className={`gitms-activity ${styles.root} ${className ?? ""}`}>
      <div className={styles.scroll}>
        <div className={styles.graph} role="img" aria-label={summary}>
          <div className={styles.days} aria-hidden="true">
            <span className={`gitms-activity-label ${styles.month}`} />
            {DAY_NAMES.map((d, i) => (
              <span key={i} className={`gitms-activity-label ${styles.dayName}`}>
                {d}
              </span>
            ))}
          </div>
          {weeks.map((week, i) => (
            <div key={i} className={styles.week} aria-hidden="true">
              <span className={`gitms-activity-label ${styles.month}`}>{week.month ?? ""}</span>
              {week.days.map((day, j) =>
                day ? (
                  <span key={j} className={`gitms-activity-cell ${styles.cell}`} data-level={day.level} title={dayLabel(day)} />
                ) : (
                  <span key={j} className={styles.pad} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      {footer || legend ? (
        <div className={styles.foot}>
          <div>{footer}</div>
          {legend ? (
            <div className={`gitms-activity-label ${styles.legend}`} aria-hidden="true">
              {legend[0]}
              {[0, 1, 2, 3, 4].map((level) => (
                <span key={level} className={`gitms-activity-cell ${styles.cell}`} data-level={level} />
              ))}
              {legend[1]}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

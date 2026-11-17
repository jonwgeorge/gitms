"use client";

import { useActionState } from "react";
import type { ActivityDraft } from "../core/activity-draft";
import type { FormState } from "../core/drafts";
import { Field } from "./Field";
import { FormStatus, useFocusAfter } from "./FormStatus";
import btn from "./Button.module.css";
import styles from "./admin.module.css";
import { saveActivity } from "./actions/activity";

type Action = (prev: FormState<ActivityDraft>, fd: FormData) => Promise<FormState<ActivityDraft>>;

/** Show the GitHub heat map or not, and whose. */
export function ActivityForm({ initial, action = saveActivity }: { initial: FormState<ActivityDraft>; action?: Action }) {
  const [state, formAction, pending] = useActionState(action, initial);
  useFocusAfter(state);
  const { draft, errors } = state;
  return (
    <form key={state.rev} action={formAction} noValidate className={`${styles.panel} ${styles.form}`} aria-labelledby="activity-heading">
      <input type="hidden" name="sha" value={state.sha} />
      <h2 id="activity-heading" className="gitms-h2">
        GitHub heat map
      </h2>
      <FormStatus id="activity-status" state={state} />
      <div className={styles.choices}>
        <label className="gitms-body" htmlFor="f-activity-show">
          <input id="f-activity-show" type="checkbox" name="activity.show" defaultChecked={draft.show} />
          Show the heat map on the site
        </label>
      </div>
      <div className={styles.grid}>
        <Field
          name="activity.github"
          label="GitHub username"
          value={draft.github}
          errors={errors}
          placeholder="octocat"
          hint="Whose contributions to show. A profile link works too."
        />
      </div>
      <div>
        <button type="submit" name="intent" value="save" disabled={pending} data-variant="primary" className={`gitms-button ${btn.btn} ${styles.button}`}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

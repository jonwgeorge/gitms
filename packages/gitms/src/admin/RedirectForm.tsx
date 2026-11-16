"use client";

import { useActionState } from "react";
import { initialState, type FormState } from "../core/drafts";
import { emptyRedirect, type RedirectDraft } from "../core/redirect-draft";
import { Field } from "./Field";
import { FormStatus, useFocusAfter } from "./FormStatus";
import btn from "./Button.module.css";
import styles from "./admin.module.css";
import { addRedirect } from "./actions/redirects";

type Action = (prev: FormState<RedirectDraft>, fd: FormData) => Promise<FormState<RedirectDraft>>;

/** Add (or update) one redirect. A success reloads the list with a flash; errors stay here. */
export function RedirectForm({ action = addRedirect }: { action?: Action }) {
  const [state, formAction, pending] = useActionState(action, initialState(emptyRedirect(), ""));
  useFocusAfter(state);
  const { draft, errors } = state;
  return (
    <form key={state.rev} action={formAction} noValidate className={`${styles.section} ${styles.stack}`} aria-labelledby="add-redirect">
      <h2 id="add-redirect" className="gitms-label">
        Add a redirect
      </h2>
      <FormStatus id="redirect-status" state={state} />
      <div className={styles.grid}>
        <Field name="from" label="Old URL" value={draft.from} errors={errors} required className={styles.wide} placeholder="/old-page" hint="A path on this site, like /about-me or /blog/old-post." />
        <Field name="to" label="Redirects to" value={draft.to} errors={errors} required className={styles.wide} placeholder="/about" hint="A path on this site, or a full https:// link." />
      </div>
      <div className={styles.choices}>
        <label className="gitms-body" htmlFor="f-permanent">
          <input id="f-permanent" type="checkbox" name="permanent" defaultChecked={draft.permanent} />
          Permanent (308): search engines move the old URL&apos;s ranking to the new one
        </label>
      </div>
      <p className={`gitms-small ${styles.hint}`}>Adding an old URL that already redirects changes where it goes.</p>
      <div>
        <button type="submit" disabled={pending} data-variant="primary" className={`gitms-button ${btn.btn} ${styles.button}`}>
          {pending ? "Saving…" : "Add redirect"}
        </button>
      </div>
    </form>
  );
}

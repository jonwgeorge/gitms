"use client";

import { useEffect } from "react";
import { fieldId, fieldLabel, type FormState } from "../core/drafts";
import styles from "./admin.module.css";

/**
 * The save outcome for one form: errors (with links to each bad field) or the
 * saved message with its commit link, plus an optional note on the last
 * client-side edit. Focused after each server round trip.
 */
type Props<D> = {
  id: string;
  state: FormState<D>;
  note?: string | null;
  /** Changes with every note; the note is re-rendered as a new node so a repeat is announced too. */
  noteKey?: number;
};

export function FormStatus<D>({ id, state, note, noteKey }: Props<D>) {
  const errors = Object.entries(state.errors);
  const kind = state.formError ? "error" : state.saved ? "saved" : undefined;
  return (
    <div id={id} tabIndex={-1} className={`gitms-body ${styles.status}`} data-kind={kind} role={kind === "error" ? "alert" : "status"}>
      {state.formError ? (
        <>
          <p className={`gitms-label ${styles.statusTitle}`} data-kind="error">
            Not saved
          </p>
          <p>{state.formError}</p>
          {errors.length ? (
            <ul>
              {errors.map(([path, message]) => (
                <li key={path}>
                  <a href={`#${fieldId(path)}`}>
                    {fieldLabel(path)}: {message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : state.saved ? (
        <>
          <p className={`gitms-label ${styles.statusTitle}`} data-kind="saved">
            Saved
          </p>
          <p>
            {state.saved.message}{" "}
            {state.saved.commitUrl ? (
              <a href={state.saved.commitUrl} rel="noopener noreferrer">
                View commit {state.saved.commitSha?.slice(0, 7)}
              </a>
            ) : null}
          </p>
          <p>{state.saved.live}</p>
        </>
      ) : null}
      {/* Client-side edits are announced here too. */}
      {note ? (
        <p key={noteKey} className={styles.note}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** After the server returns a new draft, put focus where the user expects it. */
export function useFocusAfter<D>(state: FormState<D>) {
  useEffect(() => {
    if (state.rev === 0 || !state.focus) return;
    document.getElementById(state.focus)?.focus();
  }, [state.rev, state.focus]);
}

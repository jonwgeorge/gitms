"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions/auth";
import btn from "./Button.module.css";
import styles from "./admin.module.css";

type Action = (prev: LoginState, fd: FormData) => Promise<LoginState>;

export function LoginForm({ action = login }: { action?: Action }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className={`${styles.panel} ${styles.form} ${styles.login}`}>
      <div className={styles.field}>
        <label htmlFor="password" className={`gitms-label ${styles.label}`}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={`gitms-body ${styles.input}`}
        />
        {state.error ? (
          <p id="login-error" role="alert" className={`gitms-small ${styles.error}`}>
            {state.error}
          </p>
        ) : null}
      </div>
      <div className={styles.toolbar}>
        <button type="submit" disabled={pending} data-variant="primary" className={`gitms-button ${btn.btn} ${styles.button}`}>
          {pending ? "Checking…" : "Log in"}
        </button>
      </div>
    </form>
  );
}

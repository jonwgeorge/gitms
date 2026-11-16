import type { ReactNode } from "react";
import { errorId, fieldId, type FieldErrors } from "../core/drafts";
import styles from "./admin.module.css";

type Common = {
  /** The field's path in the content file, e.g. `social.1.href`; also its form name. */
  name: string;
  label: ReactNode;
  value: string;
  errors: FieldErrors;
  hint?: string;
  required?: boolean;
  className?: string;
  /** Makes the field controlled: the form's client state owns the value. */
  onValue?: (name: string, value: string) => void;
  /** Watches an uncontrolled field's value as the user types (e.g. a live preview). */
  onInput?: (value: string) => void;
  onBlur?: () => void;
};

type Props =
  | (Common & {
      as?: "input";
      type?: "text" | "email" | "url" | "password" | "datetime-local";
      autoComplete?: string;
      inputMode?: "text" | "url" | "email" | "numeric";
      /** Id of a <datalist> of suggestions. */
      list?: string;
      placeholder?: string;
    })
  | (Common & { as: "textarea"; rows?: number; inputClassName?: string })
  | (Common & { as: "select"; options: readonly string[] });

/**
 * A labelled input with its hint and inline error, wired with
 * `aria-describedby` and `aria-invalid` (AC11).
 */
export function Field(props: Props) {
  const { name, label, value, errors, hint, required, className, onValue, onInput, onBlur } = props;
  const id = fieldId(name);
  const error = errors[name];
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [hintId, error ? errorId(name) : undefined].filter(Boolean).join(" ") || undefined;
  const shared = {
    id,
    name,
    ...(onValue
      ? { value, onChange: (e: { target: { value: string } }) => onValue(name, e.target.value) }
      : { defaultValue: value }),
    required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    onBlur,
    className: `gitms-body ${styles.input}`,
  };

  let control: ReactNode;
  if (props.as === "textarea") {
    const { rows = 3, inputClassName } = props;
    control = (
      <textarea
        {...shared}
        rows={rows}
        className={`${shared.className} ${inputClassName ?? ""}`}
        onInput={onInput ? (e) => onInput(e.currentTarget.value) : undefined}
      />
    );
  }
  else if (props.as === "select") {
    const options = props.options.includes(value) ? props.options : [value, ...props.options];
    control = (
      <select {...shared}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "" ? "(none)" : o}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        {...shared}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete ?? "off"}
        inputMode={props.inputMode}
        list={props.list}
        onInput={onInput ? (e) => onInput(e.currentTarget.value) : undefined}
        placeholder={props.placeholder}
        spellCheck={false}
      />
    );
  }

  return (
    <div className={`${styles.field} ${className ?? ""}`}>
      <label htmlFor={id} className={`gitms-label ${styles.label}`}>
        {label}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className={`gitms-small ${styles.hint}`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId(name)} className={`gitms-small ${styles.error}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

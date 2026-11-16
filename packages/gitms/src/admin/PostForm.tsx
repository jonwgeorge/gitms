"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Led } from "./Led";
import { Markdown } from "./Markdown";
import type { CustomField } from "../config";
import { fieldId, type FormState } from "../core/drafts";
import { slugify, type PostDraft } from "../core/post-draft";
import { savePost } from "./actions/posts";
import { Field } from "./Field";
import { ImageUpload, usePreviewImages } from "./ImageUpload";
import { RenameRedirect } from "./RenameRedirect";
import { FormStatus, useFocusAfter } from "./FormStatus";
import { useFrontMatterPaste } from "./front-matter-paste";
import { SeoFields } from "./SeoFields";
import btn from "./Button.module.css";
import styles from "./admin.module.css";

type Action = (prev: FormState<PostDraft>, fd: FormData) => Promise<FormState<PostDraft>>;

/** What the post editor needs from the config (serializable, so it can cross to the client). */
export type PostFormConfig = {
  readonly fields: Readonly<Record<string, CustomField>>;
  readonly timeZone: string;
  /** Public URL pattern, e.g. "/blog/:slug". */
  readonly route: string;
  /** Upload size limit, or null when uploads are off. */
  readonly uploadMaxBytes: number | null;
};

type Props = {
  initial: FormState<PostDraft>;
  config: PostFormConfig;
  /** The post's slug as stored; empty for a new post. */
  orig: string;
  /** Values to suggest for text fields with `suggest` (the ones earlier posts used), by field name. */
  suggestions: Readonly<Record<string, readonly string[]>>;
  /** The post's public URL as stored, when it has one now (renaming then offers a redirect from it). */
  liveUrl?: string | null;
  action?: Action;
};

/**
 * One post: title and markdown body (with a preview) on the left; status,
 * date, custom fields and slug beside it. Save with the button or Ctrl/⌘+S; leaving with
 * unsaved changes asks first.
 */
export function PostForm({ initial, config, orig, suggestions, liveUrl = null, action = savePost }: Props) {
  const [state, formAction, pending] = useActionState(action, initial);
  useFocusAfter(state);
  // Remount on each server reply so the fields show what was saved.
  return <PostFields key={state.rev} state={state} config={config} formAction={formAction} pending={pending} orig={orig} liveUrl={liveUrl} suggestions={suggestions} />;
}

function PostFields({
  state,
  config,
  formAction,
  pending,
  orig,
  liveUrl,
  suggestions,
}: {
  state: FormState<PostDraft>;
  config: PostFormConfig;
  formAction: (fd: FormData) => void;
  pending: boolean;
  orig: string;
  liveUrl: string | null;
  suggestions: Readonly<Record<string, readonly string[]>>;
}) {
  const { draft, errors } = state;
  // The Visibility choice, so the save button says what a save will do.
  const [status, setStatus] = useState(draft.status);
  const form = useRef<HTMLFormElement>(null);
  // A failed save keeps the typed values, so they still count as unsaved.
  const [dirty, setDirty] = useState(state.formError !== null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [body, setBody] = useState(draft.body);
  const preview = useRef<HTMLDivElement>(null);
  usePreviewImages(preview, [tab, body]);
  const [title, setTitle] = useState(draft.title);
  const [slug, setSlug] = useState(draft.slug);
  const frontMatter = useFrontMatterPaste("post", form, { title: setTitle, slug: setSlug, status: setStatus }, { fields: config.fields, timeZone: config.timeZone });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      form.current?.requestSubmit();
    }
  };

  const url = slug.trim() || slugify(title);
  const href = (s: string) => config.route.replace(":slug", s);

  return (
    <form
      ref={form}
      action={(fd) => {
        setDirty(false);
        formAction(fd);
      }}
      onInput={() => setDirty(true)}
      onKeyDown={onKeyDown}
      noValidate
      className={styles.stack}
    >
      <input type="hidden" name="orig" value={orig} />
      <input type="hidden" name="ver" value={state.sha} />
      <FormStatus id="post-status" state={state} />
      <div className={styles.editor}>
        <div className={styles.editorMain}>
          <Field
            name="title"
            label="Title"
            value={draft.title}
            errors={errors}
            required
            className={styles.full}
            placeholder="what happened"
            onInput={setTitle}
          />
          <div className={styles.field}>
            <div className={styles.bodyTabs} role="tablist" aria-label="Body">
              <button type="button" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")} className="gitms-small">
                Write
              </button>
              <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className="gitms-small">
                Preview
              </button>
            </div>
            <div hidden={tab !== "write"} onPaste={frontMatter.onPaste}>
              <Field
                as="textarea"
                name="body"
                label="Body (markdown)"
                value={draft.body}
                errors={errors}
                rows={18}
                inputClassName={styles.bodyInput}
                hint="Markdown: # heading, **bold**, *italic*, `code`, [link](https://…), ![image](/uploads/…), - lists, > quotes, ``` code blocks. A post with an empty body has no page of its own. Pasting a file that starts with --- front matter fills the settings from it."
                onInput={setBody}
              />
              {config.uploadMaxBytes ? <ImageUpload target={fieldId("body")} maxBytes={config.uploadMaxBytes} /> : null}
              <p role="status" className={`gitms-small ${styles.hint}`} data-testid="front-matter-notice">
                {frontMatter.notice}
              </p>
            </div>
            {tab === "preview" ? (
              <div ref={preview} className={styles.preview} aria-label="Preview">
                {body.trim() ? <Markdown source={body} className="gitms-body" /> : <p className={`gitms-body ${styles.muted}`}>Nothing to preview yet.</p>}
              </div>
            ) : null}
          </div>
        </div>

        <aside className={styles.editorSide} aria-label="Post settings">
          <div className={`${styles.section} ${styles.saveBar}`}>
            <button type="submit" disabled={pending} data-variant="primary" className={`gitms-button ${btn.btn} ${styles.button}`}>
              {pending ? "Saving…" : status === "draft" ? "Save draft" : orig && draft.status === "published" ? "Save post" : "Publish post"}
            </button>
            {dirty ? (
              <span className={`gitms-label ${styles.dirty}`} data-testid="unsaved">
                <Led state="warn" />
                Unsaved changes
              </span>
            ) : null}
            <p className={`gitms-small ${styles.hint}`}>
              {status === "draft"
                ? "Drafts are saved but stay off the site until you choose Published. "
                : "Saves commit to the repo and go live when the site rebuilds. "}
              <span className={styles.kbd}>Ctrl</span>/
              <span className={styles.kbd}>⌘</span>+<span className={styles.kbd}>S</span> saves too.
            </p>
          </div>

          <fieldset className={styles.section}>
            <legend className="gitms-label">Visibility</legend>
            <div className={styles.choices}>
              <label className="gitms-body" htmlFor="f-status-published">
                <input id="f-status-published" type="radio" name="status" value="published" defaultChecked={draft.status === "published"} onChange={() => setStatus("published")} />
                Published
              </label>
              <label className="gitms-body" htmlFor="f-status-draft">
                <input id="f-status-draft" type="radio" name="status" value="draft" defaultChecked={draft.status === "draft"} onChange={() => setStatus("draft")} />
                Draft (hidden from the site)
              </label>
            </div>
          </fieldset>

          <div className={`${styles.section} ${styles.stack}`}>
            <Field
              name="at"
              type="datetime-local"
              label="Date and time"
              value={draft.at}
              errors={errors}
              hint={`In ${config.timeZone.replace(/_/g, " ")} time. A future date schedules the post: it goes live with the first build after that time.`}
              required
            />
            {Object.entries(config.fields).map(([name, field]) =>
              field.type === "select" ? (
                <Field key={name} as="select" name={name} label={field.label} value={draft.fields[name] ?? ""} errors={errors} options={field.options} hint={field.hint} />
              ) : (
                <div key={name} className={styles.stack}>
                  <Field
                    name={name}
                    label={field.required === false ? `${field.label} (optional)` : field.label}
                    value={draft.fields[name] ?? ""}
                    errors={errors}
                    list={field.suggest ? `post-${name}-list` : undefined}
                    hint={field.hint}
                    required={field.required !== false}
                  />
                  {field.suggest ? (
                    <datalist id={`post-${name}-list`}>
                      {(suggestions[name] ?? []).map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  ) : null}
                </div>
              ),
            )}
            <Field name="slug" label="Slug" value={draft.slug} errors={errors} hint="Leave empty to make one from the title." onInput={setSlug} />
            <p className={`gitms-small ${styles.hint}`}>
              URL: <code>{href(url || "…")}</code>
              {body.trim() ? null : " (no page until the post has a body)"}
            </p>
            <RenameRedirect liveUrl={liveUrl} next={href(url)} changed={!!orig && !!url && url !== orig} />
          </div>
          <SeoFields description={draft.description} shareImage={draft.shareImage} errors={errors} kind="post" />
        </aside>
      </div>
    </form>
  );
}

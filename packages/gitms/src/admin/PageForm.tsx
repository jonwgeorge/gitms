"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Led } from "./Led";
import { Markdown } from "./Markdown";
import { fieldId, type FormState } from "../core/drafts";
import { slugify } from "../core/post-draft";
import type { PageDraft } from "../core/page-draft";
import { Field } from "./Field";
import { ImageUpload, usePreviewImages } from "./ImageUpload";
import { RenameRedirect } from "./RenameRedirect";
import { FormStatus, useFocusAfter } from "./FormStatus";
import { useFrontMatterPaste } from "./front-matter-paste";
import { SeoFields } from "./SeoFields";
import { savePage } from "./actions/pages";
import btn from "./Button.module.css";
import styles from "./admin.module.css";

type Action = (prev: FormState<PageDraft>, fd: FormData) => Promise<FormState<PageDraft>>;

/** What the page editor needs from the config (serializable). */
export type PageFormConfig = {
  /** Public URL pattern, e.g. "/:slug". */
  readonly route: string;
  /** Offer the "Show in nav" box. */
  readonly nav: boolean;
  readonly uploadMaxBytes: number | null;
};

type Props = {
  initial: FormState<PageDraft>;
  config: PageFormConfig;
  /** The page's slug as stored; empty for a new page. */
  orig: string;
  /** The page's public URL as stored, when it is live now (renaming then offers a redirect from it). */
  liveUrl?: string | null;
  action?: Action;
};

/**
 * One page: title and markdown body (with a preview) on the left; visibility,
 * nav and slug beside it. Save with the button or Ctrl/⌘+S; leaving with
 * unsaved changes asks first.
 */
export function PageForm({ initial, config, orig, liveUrl = null, action = savePage }: Props) {
  const [state, formAction, pending] = useActionState(action, initial);
  useFocusAfter(state);
  // Remount on each server reply so the fields show what was saved.
  return <PageFields key={state.rev} state={state} config={config} formAction={formAction} pending={pending} orig={orig} liveUrl={liveUrl} />;
}

function PageFields({
  state,
  config,
  formAction,
  pending,
  orig,
  liveUrl,
}: {
  state: FormState<PageDraft>;
  config: PageFormConfig;
  formAction: (fd: FormData) => void;
  pending: boolean;
  orig: string;
  liveUrl: string | null;
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
  const frontMatter = useFrontMatterPaste("page", form, { title: setTitle, slug: setSlug, status: setStatus });

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
      <FormStatus id="page-status" state={state} />
      <div className={styles.editor}>
        <div className={styles.editorMain}>
          <Field name="title" label="Title" value={draft.title} errors={errors} required className={styles.full} placeholder="About" onInput={setTitle} />
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
                rows={20}
                inputClassName={styles.bodyInput}
                hint="Markdown: # heading, **bold**, *italic*, `code`, [link](https://…), ![image](/uploads/…), - lists, > quotes, ``` code blocks. Pasting a file that starts with --- front matter fills the settings from it."
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

        <aside className={styles.editorSide} aria-label="Page settings">
          <div className={`${styles.section} ${styles.saveBar}`}>
            <button type="submit" disabled={pending} data-variant="primary" className={`gitms-button ${btn.btn} ${styles.button}`}>
              {pending ? "Saving…" : status === "draft" ? "Save draft" : orig && draft.status === "published" ? "Save page" : "Publish page"}
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

          {config.nav ? (
          <fieldset className={styles.section}>
            <legend className="gitms-label">Navigation</legend>
            <div className={styles.choices}>
              <label className="gitms-body" htmlFor="f-nav">
                <input id="f-nav" type="checkbox" name="nav" defaultChecked={draft.nav} />
                Show in the site navigation
              </label>
            </div>
            <p className={`gitms-small ${styles.hint}`}>Stored as <code>nav: true</code>; your site decides where it shows.</p>
          </fieldset>
          ) : null}

          <div className={`${styles.section} ${styles.stack}`}>
            <Field name="slug" label="Slug" value={draft.slug} errors={errors} hint="Leave empty to make one from the title." onInput={setSlug} />
            <p className={`gitms-small ${styles.hint}`}>
              URL: <code>{config.route.replace(":slug", url || "…")}</code>
            </p>
            <RenameRedirect liveUrl={liveUrl} next={config.route.replace(":slug", url)} changed={!!orig && !!url && url !== orig} />
          </div>
          <SeoFields description={draft.description} shareImage={draft.shareImage} errors={errors} kind="page" />
        </aside>
      </div>
    </form>
  );
}

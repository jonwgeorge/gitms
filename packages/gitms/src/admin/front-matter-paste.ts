"use client";

import { useCallback, useState, type ClipboardEvent, type RefObject } from "react";
import { fieldId } from "../core/drafts";
import type { CustomField } from "../config";
import { frontMatterFields, parseFrontMatter, type FrontMatterFields } from "../core/front-matter";

/** In the order the editors show them (custom fields are listed last). */
const LABELS: Record<Exclude<keyof FrontMatterFields, "fields">, string> = {
  title: "title",
  status: "visibility",
  nav: "navigation",
  at: "date",
  slug: "slug",
  description: "description",
  shareImage: "share image",
};

const list = (words: string[]) =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

type Setters = Partial<{
  title: (v: string) => void;
  slug: (v: string) => void;
  status: (v: "published" | "draft") => void;
}>;

/** Puts text into the textarea as if typed, keeping the browser's undo when it can. */
function insert(el: HTMLTextAreaElement, text: string) {
  el.focus();
  let done = false;
  try {
    done = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
  } catch {
    done = false;
  }
  if (!done) {
    el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * Pasting markdown that opens with a `---` front matter block into the body:
 * the block is dropped from the body and its values fill the matching settings.
 * Returns the paste handler and a line saying what was filled.
 */
export function useFrontMatterPaste(
  kind: "post" | "page",
  form: RefObject<HTMLFormElement | null>,
  set: Setters,
  opts: { readonly fields?: Readonly<Record<string, CustomField>>; readonly timeZone?: string } = {},
) {
  const [notice, setNotice] = useState("");

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLElement>) => {
      const el = e.target;
      if (!(el instanceof HTMLTextAreaElement) || el.name !== "body") return;
      const parsed = parseFrontMatter(e.clipboardData.getData("text/plain"));
      if (!parsed) return;
      e.preventDefault();
      const f = form.current;
      const at = f?.elements.namedItem("at");
      const currentTime = at instanceof HTMLInputElement ? at.value.split("T")[1] : undefined;
      const fields = frontMatterFields(parsed.data, kind, { fields: opts.fields, timeZone: opts.timeZone, currentTime: currentTime || undefined });

      const filled: string[] = [];
      const setInput = (name: string, value: string) => {
        const input = f?.querySelector<HTMLInputElement | HTMLSelectElement>(`#${fieldId(name)}`);
        if (!input) return false;
        input.value = value;
        return true;
      };
      for (const key of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
        const value = fields[key];
        if (!f) break;
        if (value === undefined) continue;
        if (key === "status") {
          const radio = f.querySelector<HTMLInputElement>(`#f-status-${value}`);
          if (!radio) continue;
          radio.checked = true;
          set.status?.(value as "published" | "draft");
        } else if (key === "nav") {
          const box = f.querySelector<HTMLInputElement>("#f-nav");
          if (!box) continue;
          box.checked = value as boolean;
        } else {
          if (!setInput(key, value as string)) continue;
          if (key === "title") set.title?.(value as string);
          if (key === "slug") set.slug?.(value as string);
        }
        filled.push(LABELS[key]);
      }
      for (const [name, v] of Object.entries(fields.fields ?? {})) {
        if (setInput(name, v)) filled.push(opts.fields?.[name]?.label.toLowerCase() ?? name);
      }

      insert(el, parsed.body);
      setNotice(
        filled.length
          ? `Filled ${list(filled)} from the front matter. Check them before you save.`
          : "Removed the front matter. None of its fields matched this editor.",
      );
    },
    [form, kind, set, opts],
  );

  return { onPaste, notice };
}

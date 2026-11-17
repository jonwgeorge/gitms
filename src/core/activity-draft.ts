/** The Activity form's draft (client-safe). */
import { formValue } from "./drafts";

export type ActivityDraft = { readonly show: boolean; readonly github: string };

/** The settings file → the form (missing or odd values become an empty, hidden draft). */
export function activityDraft(content: unknown): ActivityDraft {
  const a = (content as { activity?: { show?: unknown; github?: unknown } } | null)?.activity;
  return { show: a?.show === true, github: typeof a?.github === "string" ? a.github : "" };
}

export function readActivityDraft(fd: FormData): ActivityDraft {
  // A GitHub URL or "@name" pasted in becomes the bare username.
  const typed = formValue(fd, "activity.github").trim();
  const github = typed.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
  return { show: fd.get("activity.show") === "on", github };
}

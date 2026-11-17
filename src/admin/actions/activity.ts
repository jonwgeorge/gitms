"use server";

/** Saves the Activity section's settings file. saveWholeFile checks the session first. */
import { activityFileSchema } from "../../core/activity";
import type { FormState } from "../../core/drafts";
import { validateWith } from "../../core/schema";
import { saveWholeFile, type Editor } from "../../core/whole-file";
import { activityDraft, readActivityDraft, type ActivityDraft } from "../../core/activity-draft";

const asRecord = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? v : {});

const activityEditor: Editor<ActivityDraft> = {
  key: "activity",
  file: "activity",
  commitMessage: "admin: update activity",
  read: readActivityDraft,
  op: () => null,
  merge: (current, draft) => ({ ...asRecord(current), activity: { show: draft.show, github: draft.github.trim() } }),
  validate: (content) => validateWith(activityFileSchema, content),
  owns: (path) => /^activity(\.|$)/.test(path),
  fields: [/^activity\.(show|github)$/],
  toDraft: activityDraft,
};

export async function saveActivity(prev: FormState<ActivityDraft>, formData: FormData): Promise<FormState<ActivityDraft>> {
  return saveWholeFile(activityEditor, prev, formData);
}

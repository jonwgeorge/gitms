"use client";

import { useActionState } from "react";
import { Field, FormStatus, Submit, adminStyles as styles, useFocusAfter } from "gitms/admin/ui";
import type { FormState } from "gitms/server";
import type { SiteSettings } from "@/lib/site-schema";
import { saveSite } from "./actions";

export function SiteForm({ initial }: { initial: FormState<SiteSettings> }) {
  const [state, formAction, pending] = useActionState(saveSite, initial);
  useFocusAfter(state);
  return (
    <form action={formAction} className={styles.stack} key={state.rev}>
      <input type="hidden" name="sha" value={state.sha} />
      <FormStatus id="site-status" state={state} />
      <Field name="site.title" label="Site title" value={state.draft.title} errors={state.errors} required />
      <Field name="site.tagline" label="Tagline" value={state.draft.tagline} errors={state.errors} hint="Shown under the title on the home page." />
      <div>
        <Submit intent="save" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Submit>
      </div>
    </form>
  );
}

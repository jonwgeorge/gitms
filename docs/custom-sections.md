# Custom sections

For content that isn't a post or page (site settings, a "now" list, a
profile), add a section of your own. It gets a sidebar link, the session check,
the admin chrome and the same save path as everything else: validated by your
schema, refused if stale, committed.

The [example blog](../examples/blog/app/admin/%5B%5B...gitms%5D%5D) has a
complete one.

## 1. Declare the section and its file

```ts
// gitms.config.ts
import { siteSchema } from "./lib/site-schema"; // a zod schema for the whole file

export default defineGitms({
  // ...
  sections: [{ slug: "site", label: "Site" }],
  files: { site: { path: "content/site.json", schema: siteSchema } },
});
```

The schema runs before every save; a file that fails it is never committed.

## 2. Describe the form

An `Editor` maps the form to the file: how to read the form, merge it into the
current file, validate it and map errors back to fields.

```ts
import type { Editor } from "gitms/server";

export const siteEditor: Editor<SiteSettings> = {
  key: "site",
  file: "site", // the key under `files`
  commitMessage: "site: update settings",
  read: (fd) => ({ title: String(fd.get("site.title") ?? ""), tagline: String(fd.get("site.tagline") ?? "") }),
  op: () => null, // or handle add/move/delete buttons for lists
  merge: (_current, draft) => ({ site: draft }),
  validate: (content) => { /* siteSchema.safeParse → { ok, data } | { ok: false, issues } */ },
  owns: (path) => path.startsWith("site."),
  fields: [/^site\.(title|tagline)$/],
  toDraft,
};
```

## 3. The action, the form and the section

```ts
// actions.ts
"use server";
import { saveWholeFile } from "gitms/server";
export const saveSite = (prev, fd) => saveWholeFile(siteEditor, prev, fd);
```

The form is a client component built from `gitms/admin/ui` (`Field`,
`FormStatus`, `Submit`, `RowActions` for list rows, `adminStyles`), which handle
labels, inline errors and focus.

The section itself is a server component that reads the file and renders the
form:

```tsx
import { adminGate, attempt, cms, createStore, initialState } from "gitms/server";

export async function SiteSection() {
  const gate = await adminGate();
  if (gate.state !== "admin") return null;
  const loaded = await attempt(() => createStore(cms(), gate.config.store).read("site"));
  if (!loaded.ok) return <p>Couldn't load the settings.</p>;
  return <SiteForm initial={initialState(toDraft(loaded.value.data), loaded.value.sha)} />;
}
```

## 4. Register it

```tsx
export default createAdmin({ sections: { site: SiteSection } });
```

`createAdmin` throws at startup if a configured section has no component.

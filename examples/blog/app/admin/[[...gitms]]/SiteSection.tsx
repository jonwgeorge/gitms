import { attempt, createStore, initialState, adminGate, cms } from "gitms/server";
import { SiteForm } from "./SiteForm";
import { toSiteDraft } from "./site-editor";

/** The "Site" section: reads content/site.json from the store and shows the form. */
export async function SiteSection() {
  const gate = await adminGate();
  if (gate.state !== "admin") return null; // the admin has already sent you to log in
  const loaded = await attempt(() => createStore(cms(), gate.config.store).read("site"));
  if (!loaded.ok) return <p>Couldn&apos;t load content/site.json{loaded.message ? `: ${loaded.message}` : ""}.</p>;
  return <SiteForm initial={initialState(toSiteDraft(loaded.value.data), loaded.value.sha)} />;
}

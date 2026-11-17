import { activityDraft } from "../../core/activity-draft";
import { initialState } from "../../core/drafts";
import { attempt } from "../../core/store";
import { admin, cms } from "../../runtime";
import { ActivityForm } from "../ActivityForm";
import { AdminShell } from "../AdminShell";
import { Flash, repoOf } from "../Flash";
import { LoadError } from "../LoadError";
import styles from "../admin.module.css";
import { signedIn, type SearchParams } from "./common";

/** Admin → Activity: whether the site shows a GitHub contribution heat map, and whose. */
export async function Activity({ searchParams }: { searchParams: SearchParams }) {
  const s = await signedIn();
  if ("page" in s) return s.page;
  const label = cms().activity!.label;
  const loaded = await attempt(() => s.store.read("activity"));
  if (!loaded.ok) return <LoadError title={label} current={admin("/activity")} message={loaded.message} />;
  const draft = activityDraft(loaded.value.data);
  return (
    <AdminShell title={label} current={admin("/activity")} flash={<Flash params={searchParams} repo={repoOf(s.store)} />}>
      <p className={`gitms-body ${styles.intro}`}>
        A heat map of your public GitHub contributions over the last year, like the one on your profile. The site fetches it when it
        builds, so it&apos;s as fresh as the last deploy.
        {draft.github ? (
          <>
            {" "}
            Compare with{" "}
            <a href={`https://github.com/${encodeURIComponent(draft.github)}`} rel="noopener noreferrer">
              github.com/{draft.github}
            </a>
            .
          </>
        ) : null}
      </p>
      <ActivityForm initial={initialState(draft, loaded.value.sha)} />
    </AdminShell>
  );
}

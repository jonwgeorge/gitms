import type { ComponentType } from "react";
import type { CustomSection } from "../../config";
import { admin } from "../../runtime";
import { AdminShell } from "../AdminShell";
import { Flash, repoOf } from "../Flash";
import { signedIn, type SearchParams } from "./common";

/** One of the site's own sections, inside the admin chrome, behind the session check. */
export async function Section({ section, body: Body, searchParams }: { section: CustomSection; body: ComponentType<{ searchParams: SearchParams }>; searchParams: SearchParams }) {
  const s = await signedIn();
  if ("page" in s) return s.page;
  return (
    <AdminShell title={section.label} current={admin(`/${section.slug}`)} flash={<Flash params={searchParams} repo={repoOf(s.store)} />}>
      <Body searchParams={searchParams} />
    </AdminShell>
  );
}

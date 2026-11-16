"use server";

/**
 * Restore: put a past version of one post or page back, as a new
 * commit. The old copy is read from Git on the server (the form only names the
 * commit), and the current item's fingerprint guards against overwriting an
 * edit made since the history page was opened.
 */
import { redirect } from "next/navigation";
import { adminGate } from "../../core/auth";
import { HISTORY_KINDS, itemIn, type HistoryKind } from "../../core/history";
import { doneQuery, fingerprint, looseList, mutate } from "../../core/save";
import { schemasFor, validateWith } from "../../core/schema";
import { COMMIT_SHA, StoreError, createStore } from "../../core/store";
import { admin, cms } from "../../runtime";

const validate = (kind: HistoryKind) => (d: unknown) => {
  const s = schemasFor(cms());
  return validateWith<unknown>(kind === "posts" ? s.posts! : s.pages!, d);
};
const str = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

export async function restoreVersion(fd: FormData): Promise<void> {
  const kindValue = str(fd, "kind");
  if (!Object.hasOwn(HISTORY_KINDS, kindValue)) redirect(admin());
  const kind = kindValue as HistoryKind;
  if (!cms()[kind]) redirect(admin());
  const { file, list } = HISTORY_KINDS[kind];
  const section = admin(HISTORY_KINDS[kind].section);
  const slug = str(fd, "slug").slice(0, 100);
  const commit = str(fd, "commit");
  const ver = str(fd, "ver");
  const back = `${section}/${encodeURIComponent(slug)}/history`;

  // The session check comes before any store access (mutate checks it again).
  const gate = await adminGate();
  if (gate.state !== "admin") redirect(admin("/login"));
  if (!COMMIT_SHA.test(commit)) redirect(`${back}?error=missing`);

  let old: Record<string, unknown> | undefined;
  try {
    old = itemIn(await createStore(cms(), gate.config.store).readAt(file, commit), list, slug);
  } catch (error) {
    if (!(error instanceof StoreError)) console.error("admin restore read failed", error instanceof Error ? error.name : "unknown");
    redirect(`${back}?error=store`);
  }
  if (!old) redirect(`${back}?error=missing`);
  const version = old;

  const title = String(version.title ?? slug).slice(0, 60);
  const outcome = await mutate(
    file,
    `${kind}: restore "${title}" to ${commit.slice(0, 7)}`,
    (current) => {
      const items = looseList(current[list]);
      const index = items.findIndex((x) => x.slug === slug);
      if (index < 0) return { error: "missing" };
      if (fingerprint(items[index]) !== ver) return { error: "stale" };
      items[index] = version;
      return { data: { ...current, [list]: items } };
    },
    validate(kind),
  );
  if (outcome.ok) redirect(`${section}/${encodeURIComponent(slug)}${doneQuery("restored", outcome)}`);
  if (outcome.code === "denied" || outcome.code === "unconfigured") redirect(admin("/login"));
  redirect(`${back}?error=${outcome.code}`);
}

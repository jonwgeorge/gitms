"use server";

/**
 * Redirect actions: add one and delete one in the redirects file. Each
 * checks the session itself (see core/save).
 */
import { redirect } from "next/navigation";
import { adminGate } from "../../core/auth";
import type { FormState } from "../../core/drafts";
import { readRedirectDraft, redirectContent, type RedirectDraft } from "../../core/redirect-draft";
import { livePaths } from "../../core/redirects";
import { FAIL_TEXT, asRecord, doneQuery, fingerprint, itemErrors, looseList, mutate, type Outcome } from "../../core/save";
import { schemasFor, validateWith } from "../../core/schema";
import { createStore } from "../../core/store";
import { admin, cms } from "../../runtime";

const validateRedirects = (d: unknown) => validateWith(schemasFor(cms()).redirects, d);

const FIELDS = ["from", "to", "permanent"];
const str = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/** Live page and post URLs, so a redirect can't hide one. Empty if they can't be read (the build skips such a redirect anyway). */
async function liveNow(): Promise<ReadonlySet<string>> {
  const gate = await adminGate();
  if (gate.state !== "admin") return new Set();
  const c = cms();
  const store = createStore(c, gate.config.store);
  try {
    const [pages, posts] = await Promise.all([c.pages ? store.read("pages") : null, c.posts ? store.read("posts") : null]);
    const items = (v: unknown) => looseList(v).map((p) => ({ slug: String(p.slug ?? ""), draft: p.draft === true, body: String(p.body ?? ""), at: String(p.at ?? "") }));
    return livePaths(c, items(asRecord(pages?.data).pages), items(asRecord(posts?.data).posts));
  } catch {
    return new Set();
  }
}

export async function addRedirect(prev: FormState<RedirectDraft>, fd: FormData): Promise<FormState<RedirectDraft>> {
  const draft = readRedirectDraft(fd);
  const base: FormState<RedirectDraft> = { draft, sha: "", rev: prev.rev + 1, errors: {}, formError: null, saved: null, focus: "redirect-status" };
  const item = redirectContent(draft, cms().hosts);
  const fail = (errors: Record<string, string>, other: string[] = []) => {
    const count = Object.keys(errors).length;
    const lead = count ? `Fix ${count} field${count === 1 ? "" : "s"} below. Nothing was saved.` : FAIL_TEXT.invalid;
    return { ...base, formError: [lead, ...other].join(" "), errors };
  };

  if ((await liveNow()).has(item.from)) {
    return fail({ from: `${item.from} is a live page; a redirect would hide it. Rename or delete that page first.` });
  }

  let index = -1;
  let replaced = false;
  const outcome: Outcome = await mutate(
    "redirects",
    `redirects: ${item.from.slice(0, 80)} → ${item.to.slice(0, 80)}`,
    (file) => {
      const redirects = looseList(file.redirects);
      index = redirects.findIndex((r) => r.from === item.from);
      // Adding an old URL that already redirects updates it (that's the only way to edit one).
      if (index >= 0) {
        redirects[index] = item;
        replaced = true;
      } else {
        redirects.push(item);
        index = redirects.length - 1;
      }
      return { data: { ...file, redirects } };
    },
    validateRedirects,
  );

  if (!outcome.ok) {
    if (outcome.code === "invalid" && outcome.issues) {
      const { errors, other } = itemErrors(outcome.issues, `redirects.${index}`, FIELDS);
      return fail(errors, other);
    }
    return { ...base, formError: outcome.message ?? FAIL_TEXT[outcome.code] };
  }
  redirect(`${admin("/redirects")}${doneQuery(replaced ? "updated" : "added", outcome)}`);
}

export async function deleteRedirect(fd: FormData): Promise<void> {
  const from = str(fd, "from");
  const ver = str(fd, "ver");
  const outcome = await mutate(
    "redirects",
    `redirects: remove ${from.slice(0, 80)}`,
    (file) => {
      const redirects = looseList(file.redirects);
      const index = redirects.findIndex((r) => r.from === from);
      if (index < 0) return { error: "missing" };
      if (fingerprint(redirects[index]) !== ver) return { error: "stale" };
      redirects.splice(index, 1);
      return { data: { ...file, redirects } };
    },
    validateRedirects,
  );
  if (outcome.ok) redirect(`${admin("/redirects")}${doneQuery("removed", outcome)}`);
  if (outcome.code === "denied" || outcome.code === "unconfigured") redirect(admin("/login"));
  redirect(`${admin("/redirects")}?error=${outcome.code}`);
}

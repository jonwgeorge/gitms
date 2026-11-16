"use server";

/**
 * Page actions: save (create or edit) and delete one page in the pages file.
 * Each checks the session itself (see core/save).
 */
import { redirect } from "next/navigation";
import { routeFor } from "../../config";
import type { FormState } from "../../core/drafts";
import { pageContent, readPageDraft, toPageDraft, type PageDraft } from "../../core/page-draft";
import { FAIL_TEXT, doneQuery, fingerprint, itemErrors, looseList, mutate, savedNote, type Outcome } from "../../core/save";
import { redirectRename } from "../../core/redirect-rename";
import { schemasFor, validateWith } from "../../core/schema";
import { admin, cms } from "../../runtime";

const FIELDS = ["slug", "title", "nav", "description", "shareImage", "body"];
const RESERVED = new Set(["new"]);
/** Whether the page is public now (a rename leaves its old URL behind). */
const isLive = (p: Record<string, unknown>) => p.draft !== true;
const hrefOf = (slug: string) => routeFor(cms().pages!.route, slug);
const validatePages = (d: unknown) => {
  const c = cms();
  if (!c.pages) throw new Error("gitms: pages are not configured");
  return validateWith(schemasFor(c).pages!, d);
};
const str = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

export async function savePage(prev: FormState<PageDraft>, fd: FormData): Promise<FormState<PageDraft>> {
  const draft = readPageDraft(fd);
  const orig = str(fd, "orig");
  const ver = str(fd, "ver");
  const base: FormState<PageDraft> = { draft, sha: ver, rev: prev.rev + 1, errors: {}, formError: null, saved: null, focus: "page-status" };
  const page = pageContent(draft);
  const autoSlug = !draft.slug.trim();
  if (RESERVED.has(String(page.slug))) {
    return { ...base, formError: "Fix 1 field below. Nothing was saved.", errors: { slug: '"new" is reserved for the New page page; pick another slug' } };
  }
  let index = -1;
  let wasLive = false;

  const title = String(page.title).slice(0, 60);
  const outcome: Outcome = await mutate(
    "pages",
    orig ? `pages: update "${title}"` : `pages: add "${title}"`,
    (file) => {
      const pages = looseList(file.pages);
      if (orig) {
        index = pages.findIndex((p) => p.slug === orig);
        if (index < 0) return { error: "missing" };
        if (fingerprint(pages[index]) !== ver) return { error: "stale" };
        wasLive = isLive(pages[index]);
        pages[index] = page;
      } else {
        // A slug made from the title gets a number if it is taken (`about-2`).
        if (autoSlug && page.slug) {
          const taken = new Set(pages.map((p) => p.slug));
          const stem = String(page.slug).slice(0, 76);
          for (let n = 2; taken.has(page.slug); n++) page.slug = `${stem}-${n}`;
        }
        pages.push(page);
        index = pages.length - 1;
      }
      return { data: { ...file, pages } };
    },
    validatePages,
  );

  if (!outcome.ok) {
    if (outcome.code === "invalid" && outcome.issues) {
      const { errors, other } = itemErrors(outcome.issues, `pages.${index}`, FIELDS);
      // An empty slug the title couldn't fill (or that made a reserved one): point at the title.
      if (autoSlug && errors.slug) {
        errors.title ??= `${errors.slug}. Change the title or type a slug.`;
        delete errors.slug;
      }
      const count = Object.keys(errors).length;
      const lead = count ? `Fix ${count} field${count === 1 ? "" : "s"} below. Nothing was saved.` : FAIL_TEXT.invalid;
      return { ...base, formError: [lead, ...other].join(" "), errors };
    }
    return { ...base, formError: outcome.message ?? FAIL_TEXT[outcome.code] };
  }

  const saved = looseList((outcome.data as { pages?: unknown }).pages)[index];
  const slug = String(saved.slug);
  // A new page, or a renamed one, lives at a new URL.
  if (!orig) redirect(`${admin("/pages")}/${slug}${doneQuery("created", outcome)}`);
  if (slug !== orig) {
    // The old URL was public and the new one is too: point the old one here (if the box was left ticked).
    let done = "saved";
    if (wasLive && isLive(saved) && str(fd, "redirect") === "on" && cms().redirects) {
      done = (await redirectRename(hrefOf(orig), hrefOf(slug))) ? "renamed" : "renamed-noredirect";
    }
    redirect(`${admin("/pages")}/${slug}${doneQuery(done, outcome)}`);
  }
  return { ...base, draft: toPageDraft(saved), sha: fingerprint(saved), saved: savedNote(outcome, saved.draft === true) };
}

export async function deletePage(fd: FormData): Promise<void> {
  const orig = str(fd, "orig");
  const ver = str(fd, "ver");
  const outcome = await mutate(
    "pages",
    `pages: delete ${orig.slice(0, 80)}`,
    (file) => {
      const pages = looseList(file.pages);
      const index = pages.findIndex((p) => p.slug === orig);
      if (index < 0) return { error: "missing" };
      if (fingerprint(pages[index]) !== ver) return { error: "stale" };
      pages.splice(index, 1);
      return { data: { ...file, pages } };
    },
    validatePages,
  );
  if (outcome.ok) redirect(`${admin("/pages")}${doneQuery("deleted", outcome)}`);
  if (outcome.code === "denied" || outcome.code === "unconfigured") redirect(admin("/login"));
  redirect(`${admin("/pages")}/${encodeURIComponent(orig)}?error=${outcome.code}`);
}

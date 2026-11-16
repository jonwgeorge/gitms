"use server";

/**
 * Post actions: save (create or edit) and delete one post in the posts file.
 * Each checks the session itself (see core/save).
 */
import { redirect } from "next/navigation";
import { routeFor } from "../../config";
import type { FormState } from "../../core/drafts";
import { postContent, postFields, readPostDraft, toPostDraft, type PostDraft } from "../../core/post-draft";
import { redirectRename } from "../../core/redirect-rename";
import { isLivePost } from "../../core/redirects";
import { FAIL_TEXT, doneQuery, fingerprint, itemErrors, looseList, mutate, savedNote, type Outcome } from "../../core/save";
import { schemasFor, validateWith } from "../../core/schema";
import { admin, cms } from "../../runtime";

const RESERVED = new Set(["new"]);
const str = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/** Friendlier words for the date field, which the editor shows as a date picker. */
const fieldMessage = (field: string, message: string) => (field === "at" ? "Pick a date and time" : message);

function setup() {
  const c = cms();
  if (!c.posts) throw new Error("gitms: posts are not configured");
  const schema = schemasFor(c).posts!;
  return { posts: c.posts, fc: { fields: c.posts.fields, timeZone: c.timeZone }, validate: (d: unknown) => validateWith(schema, d) };
}

export async function savePost(prev: FormState<PostDraft>, fd: FormData): Promise<FormState<PostDraft>> {
  const { posts: config, fc, validate } = setup();
  const draft = readPostDraft(fd, fc);
  const orig = str(fd, "orig");
  const ver = str(fd, "ver");
  const base: FormState<PostDraft> = { draft, sha: ver, rev: prev.rev + 1, errors: {}, formError: null, saved: null, focus: "post-status" };
  const post = postContent(draft, fc);
  const autoSlug = !draft.slug.trim();
  let index = -1;
  let wasLive = false;

  if (RESERVED.has(String(post.slug))) {
    return { ...base, formError: "Fix 1 field below. Nothing was saved.", errors: { slug: '"new" is reserved for the New post page; pick another slug' } };
  }

  const title = String(post.title).slice(0, 60);
  const outcome: Outcome = await mutate(
    "posts",
    orig ? `posts: update "${title}"` : `posts: add "${title}"`,
    (file) => {
      const posts = looseList(file.posts);
      if (orig) {
        index = posts.findIndex((p) => p.slug === orig);
        if (index < 0) return { error: "missing" };
        if (fingerprint(posts[index]) !== ver) return { error: "stale" };
        wasLive = isLivePost(posts[index]);
        posts[index] = post;
      } else {
        // A slug made from the title gets a number if it is taken (`notes-2`).
        if (autoSlug && post.slug) {
          const taken = new Set(posts.map((p) => p.slug));
          const stem = String(post.slug).slice(0, 76);
          for (let n = 2; taken.has(post.slug); n++) post.slug = `${stem}-${n}`;
        }
        posts.unshift(post);
        index = 0;
      }
      return { data: { ...file, posts } };
    },
    validate,
  );

  if (!outcome.ok) {
    if (outcome.code === "invalid" && outcome.issues) {
      const { errors, other } = itemErrors(outcome.issues, `posts.${index}`, postFields(fc));
      const named: Record<string, string> = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, fieldMessage(k, v)]));
      // An empty slug the title couldn't fill: point at the title.
      if (autoSlug && named.slug) {
        named.title ??= "Add a title with letters or digits so a slug can be made from it, or type a slug";
        delete named.slug;
      }
      const count = Object.keys(named).length;
      const lead = count ? `Fix ${count} field${count === 1 ? "" : "s"} below. Nothing was saved.` : FAIL_TEXT.invalid;
      return { ...base, formError: [lead, ...other].join(" "), errors: named };
    }
    return { ...base, formError: outcome.message ?? FAIL_TEXT[outcome.code] };
  }

  const savedPost = looseList((outcome.data as { posts?: unknown }).posts)[index];
  const slug = String(savedPost.slug);
  // A new post, or a renamed one, lives at a new URL.
  if (!orig) redirect(`${admin("/posts")}/${slug}${doneQuery("created", outcome)}`);
  if (slug !== orig) {
    // The old URL was public and the new one is too: point the old one here (if the box was left ticked).
    let done = "saved";
    if (wasLive && isLivePost(savedPost) && str(fd, "redirect") === "on" && cms().redirects) {
      done = (await redirectRename(routeFor(config.route, orig), routeFor(config.route, slug))) ? "renamed" : "renamed-noredirect";
    }
    redirect(`${admin("/posts")}/${slug}${doneQuery(done, outcome)}`);
  }
  return { ...base, draft: toPostDraft(savedPost, fc), sha: fingerprint(savedPost), saved: savedNote(outcome, savedPost.draft === true) };
}

export async function deletePost(fd: FormData): Promise<void> {
  const { validate } = setup();
  const orig = str(fd, "orig");
  const ver = str(fd, "ver");
  const outcome = await mutate(
    "posts",
    `posts: delete ${orig.slice(0, 80)}`,
    (file) => {
      const posts = looseList(file.posts);
      const index = posts.findIndex((p) => p.slug === orig);
      if (index < 0) return { error: "missing" };
      if (fingerprint(posts[index]) !== ver) return { error: "stale" };
      posts.splice(index, 1);
      return { data: { ...file, posts } };
    },
    validate,
  );
  if (outcome.ok) redirect(`${admin("/posts")}${doneQuery("deleted", outcome)}`);
  if (outcome.code === "denied" || outcome.code === "unconfigured") redirect(admin("/login"));
  redirect(`${admin("/posts")}/${encodeURIComponent(orig)}?error=${outcome.code}`);
}

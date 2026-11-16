import { describe, expect, it } from "vitest";
import cms from "gitms-site-config";
import { schemasFor } from "./schema";
import { emptyPost, postContent, postFields, readPostDraft, slugify, toPostDraft, usedValues } from "./post-draft";

const c = { fields: cms.posts!.fields, timeZone: cms.timeZone };
const post = { slug: "hello", title: "Hello", at: "2026-07-01T09:00:00-04:00", category: "notes", mood: "busy", body: "Body" };

describe("post drafts", () => {
  it("round-trip a stored post unchanged, custom fields included", () => {
    const back = postContent(toPostDraft(post, c), c);
    expect(back).toEqual(post);
    expect(schemasFor(cms).post!.safeParse(back).success).toBe(true);
  });

  it("shows dates in the site zone", () => {
    expect(toPostDraft(post, c).at).toBe("2026-07-01T09:00");
  });

  it("start new posts as drafts with field defaults", () => {
    expect(emptyPost(c)).toMatchObject({ status: "draft", fields: { category: "notes", mood: "calm" } });
  });

  it("read custom fields from form data under their own names, lowercasing where asked", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ title: "T", at: "2026-07-01T09:00", category: " Travel ", mood: "calm", body: "a\r\nb", status: "published" })) fd.append(k, v);
    expect(postContent(readPostDraft(fd, c), c)).toEqual({ slug: "t", title: "T", at: "2026-07-01T09:00:00-04:00", category: "travel", mood: "calm", body: "a\nb" });
  });

  it("names every field the form owns", () => {
    expect(postFields(c)).toEqual(["slug", "title", "at", "category", "mood", "draft", "description", "shareImage", "body"]);
  });

  it("suggest used values, newest first", () => {
    expect(usedValues({ posts: [{ category: "a", at: "2026-01-01T00:00:00Z" }, { category: "b", at: "2026-02-01T00:00:00Z" }, { category: "a" }] }, "category")).toEqual(["b", "a"]);
  });

  it("slugify titles", () => {
    expect(slugify("Why I self-host the boring stuff!")).toBe("why-i-self-host-the-boring-stuff");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
  });
});

import { describe, expect, it } from "vitest";
import { frontMatterDate, frontMatterFields, parseFrontMatter } from "./front-matter";
import cms from "gitms-site-config";

describe("parseFrontMatter", () => {
  it("splits the block off and reads flat keys, quoted or not", () => {
    const text = '---\ntitle: "i built my \\"own\\" cms"\nslug: my-cms # short\ncategory: misc\nnote: \'it\'\'s fine\'\ndraft: true\n---\n\nFirst line.\n\n## Next';
    expect(parseFrontMatter(text)).toEqual({
      data: { title: 'i built my "own" cms', slug: "my-cms", category: "misc", note: "it's fine", draft: "true" },
      body: "First line.\n\n## Next",
    });
  });

  it("skips comments, lists, maps and indented lines", () => {
    const text = "---\n# a comment\ntags:\n  - one\n  - two\nextra: [a, b]\nmeta: { x: 1 }\nTitle: Hi\n---\nbody";
    expect(parseFrontMatter(text)).toEqual({ data: { title: "Hi" }, body: "body" });
  });

  it("handles CRLF, a BOM and a ... closer", () => {
    expect(parseFrontMatter("﻿---\r\ntitle: x\r\n...\r\nbody\r\n")).toEqual({ data: { title: "x" }, body: "body\n" });
  });

  it("returns null without a leading block or a closer", () => {
    expect(parseFrontMatter("# just markdown\n---\n")).toBeNull();
    expect(parseFrontMatter("intro\n---\ntitle: x\n---")).toBeNull();
    expect(parseFrontMatter("---\ntitle: never closed")).toBeNull();
  });

  it("reads a draft written elsewhere", () => {
    const text = '---\ntitle: "notes on a quiet week"\nslug: notes-on-a-quiet-week\ncategory: Notes\nmood: calm\nstatus: draft\n---\n\nNothing much happened.\n';
    const parsed = parseFrontMatter(text)!;
    expect(parsed.body).toBe("Nothing much happened.\n");
    expect(frontMatterFields(parsed.data, "post", { fields: cms.posts!.fields })).toEqual({
      title: "notes on a quiet week",
      slug: "notes-on-a-quiet-week",
      fields: { category: "notes", mood: "calm" },
      status: "draft",
    });
  });
});

describe("frontMatterFields", () => {
  it("maps post keys and aliases", () => {
    expect(
      frontMatterFields(
        { title: "T", slug: " My-Slug ", date: "2026-11-14T14:30:00Z", category: "Travel", mood: "BUSY", draft: "false", summary: "S", image: "/uploads/a.png", nav: "true" },
        "post",
        { fields: cms.posts!.fields, timeZone: "America/New_York" },
      ),
    ).toEqual({ title: "T", slug: "my-slug", at: "2026-11-14T09:30", fields: { category: "travel", mood: "busy" }, status: "published", description: "S", shareImage: "/uploads/a.png" });
  });

  it("drops post-only keys for pages and reads nav", () => {
    expect(frontMatterFields({ title: "About", category: "x", mood: "calm", at: "2026-01-01", nav: "yes", status: "published" }, "page", { fields: cms.posts!.fields })).toEqual({
      title: "About",
      nav: true,
      status: "published",
    });
  });

  it("leaves out values that don't fit", () => {
    expect(frontMatterFields({ mood: "sleepy", at: "someday", draft: "maybe", status: "archived", unknown: "x" }, "post", { fields: cms.posts!.fields })).toEqual({});
  });

  it("draft wins over status", () => {
    expect(frontMatterFields({ draft: "yes", status: "published" }, "post")).toEqual({ status: "draft" });
  });
});

describe("frontMatterDate", () => {
  it("keeps the current time for a bare date and site time for a zoneless one", () => {
    expect(frontMatterDate("2026-11-20", "14:05")).toBe("2026-11-20T14:05");
    expect(frontMatterDate("2026-11-20 08:15")).toBe("2026-11-20T08:15");
    expect(frontMatterDate("2026-07-01T12:00:00-04:00", "09:00", "America/New_York")).toBe("2026-07-01T12:00");
    expect(frontMatterDate("2026-07-01T12:00:00-04:00")).toBe("2026-07-01T16:00");
    expect(frontMatterDate("nope")).toBe("");
  });
});

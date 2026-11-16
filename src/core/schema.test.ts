import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import cms from "gitms-site-config";
import { defineGitms } from "../config";
import { isIsoDateTime, isRouteFrom, isSafeHref, issuesOf, parseContent, schemasFor, validateWith } from "./schema";

const FIXTURES = join(__dirname, "..", "..", "test", "fixtures", "content");
const read = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const posts = () => JSON.parse(read("posts.json"));
const pages = () => JSON.parse(read("pages.json"));
const s = schemasFor(cms);

function issues(schema: ZodType | null, data: unknown) {
  const r = schema!.safeParse(data);
  return r.success ? [] : issuesOf(r.error);
}

describe("the fixture content files", () => {
  it("are valid and round-trip byte for byte (clean diffs on save)", () => {
    const text = (d: unknown) => `${JSON.stringify(d, null, 2)}\n`;
    expect(issues(s.posts, posts())).toEqual([]);
    expect(text(s.posts!.parse(posts()))).toBe(read("posts.json"));
    expect(text(s.pages!.parse(pages()))).toBe(read("pages.json"));
    expect(text(s.redirects.parse(JSON.parse(read("redirects.json"))))).toBe(read("redirects.json"));
  });
});

describe("post rules", () => {
  it("checks custom text fields against their pattern, and select fields against their options", () => {
    const d = posts();
    d.posts[0].category = "Not OK";
    d.posts[1].mood = "sleepy";
    expect(issues(s.posts, d).map((i) => i.path)).toEqual(["posts.0.category", "posts.1.mood"]);
  });

  it("requires a custom field unless it is optional, and refuses unknown keys", () => {
    const d = posts();
    delete d.posts[0].category;
    d.posts[1].extra = "x";
    expect(issues(s.posts, d).map((i) => i.path)).toEqual(["posts.0.category", "posts.1"]);
  });

  it("refuses reserved and repeated slugs", () => {
    const d = posts();
    d.posts[0].slug = "tag";
    expect(issues(s.posts, d)).toEqual([{ path: "posts.0.slug", message: "That slug is taken by a route" }]);
    d.posts[0].slug = "a-draft";
    expect(issues(s.posts, d).map((i) => i.path)).toEqual(["posts.0.slug", "posts.1.slug"]);
  });

  it("needs a full ISO date with an offset", () => {
    const d = posts();
    d.posts[0].at = "2026-01-05";
    expect(issues(s.posts, d).map((i) => i.path)).toEqual(["posts.0.at"]);
  });
});

describe("page rules", () => {
  it("reserves the admin path and the configured slugs", () => {
    for (const slug of ["admin", "blog", "contact"]) {
      expect(issues(s.pages, { pages: [{ slug, title: "T", body: "" }] })[0]?.path, slug).toBe("pages.0.slug");
    }
    expect(issues(s.pages, { pages: [{ slug: "colophon", title: "T", body: "" }] })).toEqual([]);
  });
});

describe("redirect rules", () => {
  it("refuses a redirect from the site's own routes or the admin, a loop, or a self-redirect", () => {
    expect(isRouteFrom(cms, "/blog")).toBe(true);
    expect(isRouteFrom(cms, "/admin/pages")).toBe(true);
    expect(isRouteFrom(cms, "/_next/x")).toBe(true);
    expect(isRouteFrom(cms, "/old")).toBe(false);
    const r = (from: string, to: string) => ({ from, to, permanent: true });
    expect(issues(s.redirects, { redirects: [r("/admin", "/x")] })[0].path).toBe("redirects.0.from");
    expect(issues(s.redirects, { redirects: [r("/a", "/a")] })[0].message).toMatch(/itself/);
    expect(issues(s.redirects, { redirects: [r("/a", "/b"), r("/b", "/a")] })[0].message).toMatch(/loop/);
    expect(issues(s.redirects, { redirects: [r("/a", "javascript:alert(1)")] })[0].path).toBe("redirects.0.to");
  });
});

describe("defineGitms", () => {
  it("fills in defaults", () => {
    const c = defineGitms({ siteUrl: "https://example.org" });
    expect(c).toMatchObject({ basePath: "/admin", siteUrl: "https://example.org/", hosts: ["example.org"], timeZone: "UTC", posts: null, pages: null });
    expect(c.brand).toEqual({ name: "admin", title: null });
  });

  it("takes a site's own admin title", () => {
    expect(defineGitms({ siteUrl: "https://e.x", brand: { title: " Quest log " } }).brand).toEqual({ name: "admin", title: "Quest log" });
  });

  it.each([
    [{ siteUrl: "nope" }, /siteUrl/],
    [{ siteUrl: "https://e.x", basePath: "admin" }, /basePath/],
    [{ siteUrl: "https://e.x", timeZone: "Mars/Olympus" }, /timeZone/],
    [{ siteUrl: "https://e.x", posts: { file: "../x.json", route: "/:slug" } }, /posts.file/],
    [{ siteUrl: "https://e.x", posts: { file: "c/p.json", route: "/blog" } }, /:slug/],
    [{ siteUrl: "https://e.x", posts: { file: "c/p.json", route: "/:slug", fields: { title: { type: "text", label: "T" } } } }, /posts.fields.title/],
    [{ siteUrl: "https://e.x", uploads: { dir: "uploads", publicPath: "/uploads" } }, /uploads.dir/],
    [{ siteUrl: "https://e.x", sections: [{ slug: "posts", label: "x" }] }, /sections/],
  ])("refuses a bad config: %j", (config, message) => {
    expect(() => defineGitms(config as Parameters<typeof defineGitms>[0])).toThrowError(message);
  });
});

describe("dashboard tiles", () => {
  it("leave settings sections off the dashboard unless asked", () => {
    const { sections } = defineGitms({
      siteUrl: "https://e.x",
      sections: [
        { slug: "now", label: "Now" },
        { slug: "site", label: "Settings" },
        { slug: "settings", label: "Site options" },
        { slug: "prefs", label: "Settings", dashboard: true },
        { slug: "notes", label: "Notes", dashboard: false },
      ],
    });
    expect(sections.map((s) => [s.slug, s.dashboard])).toEqual([
      ["now", true],
      ["site", false],
      ["settings", false],
      ["prefs", true],
      ["notes", false],
    ]);
  });
});

describe("isSafeHref", () => {
  it.each(["/notes/x", "/", "https://example.com/a?b=c#d"])("allows %s", (h) => {
    expect(isSafeHref(h)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    " javascript:alert(1)",
    "data:text/html,hi",
    "http://example.com",
    "//evil.example",
    "/\\evil.example",
    "https://user:pw@example.com",
    "notes/x",
    "https://exa mple.com",
    "/a\nb",
  ])("rejects %j", (h) => {
    expect(isSafeHref(h)).toBe(false);
  });
});

describe("parseContent / validateWith", () => {
  it("throws a clear message naming the file and each bad field (build fails loudly)", () => {
    const d = posts();
    d.posts[0].title = "";
    d.posts[1].at = "soon";
    expect(() => parseContent(s.posts!, d, "content/posts.json")).toThrowError(
      /content\/posts\.json is invalid:\n {2}- posts\.0\.title: Required\n {2}- posts\.1\.at: Use an ISO date-time/,
    );
  });

  it("copes with garbage input", () => {
    expect(validateWith(s.posts!, posts())).toMatchObject({ ok: true });
    expect(validateWith(s.posts!, null).ok).toBe(false);
    expect(validateWith(s.pages!, { pages: "no" }).ok).toBe(false);
  });
});

describe("isIsoDateTime", () => {
  it.each(["2026-10-12T03:00:00Z", "2026-10-12T03:00Z", "2026-10-12T03:00:00.123+05:30"])("accepts %s", (v) => expect(isIsoDateTime(v)).toBe(true));
  it.each(["2026-10-12", "yesterday", "2026-13-45T99:00:00Z", 1760000000, null, "2026-10-12T03:00:00"])("rejects %s", (v) => expect(isIsoDateTime(v)).toBe(false));
});

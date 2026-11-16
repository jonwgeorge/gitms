import { describe, expect, it } from "vitest";
import cms from "gitms-site-config";
import { schemasFor, validateWith } from "./schema";
import { normalizeFrom, normalizeTo } from "./redirect-draft";
import { matchesSearch } from "./search";
import { activeRedirects, inactiveReason, livePaths, livePostUrl, withRename } from "./redirects";

const r = (from: string, to: string, permanent = true) => ({ from, to, permanent });
const validateRedirects = (data: unknown) => validateWith(schemasFor(cms).redirects, data);

describe("redirects schema", () => {
  it("accepts exact paths and https targets", () => {
    expect(validateRedirects({ redirects: [r("/old", "/new"), r("/blog/old-post", "https://example.org/x?a=1", false), r("/a.html", "/b#top")] }).ok).toBe(true);
  });

  it.each([
    ["/old/", "trailing slash"],
    ["old", "no leading slash"],
    ["/old?x=1", "a query"],
    ["/:slug", "a pattern"],
    ["/old*", "a wildcard"],
    ["/", "the home page"],
    ["/blog", "a site route"],
    ["/admin/login", "the admin"],
    ["/_next/static/x", "Next's files"],
  ])("refuses %s as an old URL (%s)", (from) => {
    expect(validateRedirects({ redirects: [r(from, "/new")] }).ok).toBe(false);
  });

  it.each(["javascript:alert(1)", "//evil.example", "http://example.org", "/x/:slug", "/a b"])("refuses %s as a target", (to) => {
    expect(validateRedirects({ redirects: [r("/old", to)] }).ok).toBe(false);
  });

  it("refuses duplicates, self-redirects and loops", () => {
    const dup = validateRedirects({ redirects: [r("/a", "/b"), r("/a", "/c")] });
    expect(!dup.ok && dup.issues[0].message).toMatch(/already starts at \/a/);
    const self = validateRedirects({ redirects: [r("/a", "/a?x=1")] });
    expect(!self.ok && self.issues[0].message).toMatch(/itself/);
    const loop = validateRedirects({ redirects: [r("/a", "/b"), r("/b", "/c"), r("/c", "/a")] });
    expect(!loop.ok && loop.issues.map((i) => i.message)).toContain("This would make a redirect loop");
    expect(validateRedirects({ redirects: [r("/a", "/b"), r("/b", "/c")] }).ok).toBe(true);
  });
});

describe("live paths and active redirects", () => {
  const live = livePaths(
    cms,
    [{ slug: "about" }, { slug: "hidden", draft: true }],
    [
      { slug: "post", body: "text" },
      { slug: "one-liner", body: " " },
      { slug: "draft-post", draft: true, body: "text" },
    ],
  );

  it("counts published pages and posts with a body, at their configured routes", () => {
    expect([...live].sort()).toEqual(["/about", "/blog/post"]);
  });

  it("skips a redirect whose old URL is live again", () => {
    expect(inactiveReason({ from: "/about" }, live)).toMatch(/live page/);
    expect(activeRedirects([r("/about", "/x"), r("/hidden", "/about", false)], live)).toEqual([{ source: "/hidden", destination: "/about", permanent: false }]);
  });

  it("gives a live post's URL, and none for a draft, empty or scheduled post", () => {
    const now = Date.parse("2026-11-15T00:00:00Z");
    expect(livePostUrl(cms, { slug: "x", body: "b" }, now)).toBe("/blog/x");
    expect(livePostUrl(cms, { slug: "x", body: "b", draft: true }, now)).toBeNull();
    expect(livePostUrl(cms, { slug: "x", body: "" }, now)).toBeNull();
    expect(livePostUrl(cms, { slug: "x", body: "b", at: "2026-12-01T00:00:00Z" }, now)).toBeNull();
  });
});

describe("withRename", () => {
  it("adds old → new and repoints chains", () => {
    expect(withRename([r("/older", "/old", false), r("/x", "/y")], "/old", "/new")).toEqual([r("/older", "/new", false), r("/x", "/y"), r("/old", "/new")]);
  });

  it("drops a redirect from the new URL (it's live now) and replaces one from the old URL", () => {
    expect(withRename([r("/new", "/elsewhere"), r("/old", "/gone")], "/old", "/new")).toEqual([r("/old", "/new")]);
  });

  it("renaming back and forth leaves no loop", () => {
    const once = withRename([], "/a", "/b");
    const back = withRename(once, "/b", "/a");
    expect(back).toEqual([r("/b", "/a")]);
    expect(validateRedirects({ redirects: back }).ok).toBe(true);
  });
});

describe("redirect form normalising", () => {
  it.each([
    ["old-page", "/old-page"],
    [" /old/ ", "/old"],
    ["https://www.example.com/old", "/old"],
    ["example.com/blog/x/", "/blog/x"],
  ])("old URL %j → %j", (typed, path) => expect(normalizeFrom(typed, cms.hosts)).toBe(path));

  it.each([
    ["about", "/about"],
    ["https://example.com/about", "/about"],
    ["https://example.com", "/"],
    ["https://example.org/x", "https://example.org/x"],
    ["javascript:alert(1)", "javascript:alert(1)"],
  ])("target %j → %j", (typed, to) => expect(normalizeTo(typed, cms.hosts)).toBe(to));
});

describe("admin post search", () => {
  const post = { title: "Notes on a quiet week", category: "travel", slug: "quiet-week" };
  it("matches title, slug or text field words, ignoring case", () => {
    expect(matchesSearch(post, "QUIET")).toBe(true);
    expect(matchesSearch(post, "travel week", ["category"])).toBe(true);
    expect(matchesSearch(post, "travel")).toBe(false);
    expect(matchesSearch(post, "  ")).toBe(true);
    expect(matchesSearch(post, "quiet loud")).toBe(false);
  });
});

describe("scheduled posts", () => {
  it("aren't live yet, so a redirect from one still applies", () => {
    const live = livePaths(cms, [], [{ slug: "soon", body: "x", at: "2026-12-01T00:00:00Z" }], Date.parse("2026-11-15T00:00:00Z"));
    expect(live.size).toBe(0);
  });
});

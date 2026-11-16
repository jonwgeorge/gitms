import { describe, expect, it } from "vitest";
import { excerpt, parseInline, parseMarkdown, readingMinutes, safeHref, safeImageSrc } from "./markdown";

describe("parseMarkdown: blocks", () => {
  it("paragraphs, headings, rules and code fences", () => {
    expect(parseMarkdown("# Title\n\nOne\ntwo\n\n---\n\n```ts\nconst a = 1;\n\n<b>\n```\n## Sub ##")).toEqual([
      { t: "h", level: 1, c: ["Title"] },
      { t: "p", c: ["One\ntwo"] },
      { t: "hr" },
      { t: "code", lang: "ts", text: "const a = 1;\n\n<b>" },
      { t: "h", level: 2, c: ["Sub"] },
    ]);
  });

  it("an unclosed fence runs to the end", () => {
    expect(parseMarkdown("```\nx")).toEqual([{ t: "code", lang: "", text: "x" }]);
  });

  it("#hashtag is not a heading", () => {
    expect(parseMarkdown("#hashtag")).toEqual([{ t: "p", c: ["#hashtag"] }]);
  });

  it("block quotes, with nested markdown", () => {
    expect(parseMarkdown("> a **b**\n> - c")).toEqual([
      { t: "quote", c: [{ t: "p", c: ["a ", { t: "strong", c: ["b"] }] }, { t: "list", ordered: false, start: 1, tight: true, items: [[{ t: "p", c: ["c"] }]] }] },
    ]);
  });

  it("tight and loose lists, ordered start, nesting and continuation lines", () => {
    const [list] = parseMarkdown("- one\n- two\n  - nested\n- three\n  more");
    expect(list).toEqual({
      t: "list",
      ordered: false,
      start: 1,
      tight: true,
      items: [
        [{ t: "p", c: ["one"] }],
        [{ t: "p", c: ["two"] }, { t: "list", ordered: false, start: 1, tight: true, items: [[{ t: "p", c: ["nested"] }]] }],
        [{ t: "p", c: ["three\nmore"] }],
      ],
    });
    const [ol] = parseMarkdown("3. a\n\n4. b");
    expect(ol).toMatchObject({ t: "list", ordered: true, start: 3, tight: false });
  });

  it("a list ends at a paragraph after a blank line", () => {
    expect(parseMarkdown("- a\n\nafter").map((b) => b.t)).toEqual(["list", "p"]);
  });
});

describe("parseInline", () => {
  it("emphasis, strong, strikethrough and code", () => {
    expect(parseInline("*a* **b** _c_ __d__ ~~e~~ `f *g*`")).toEqual([
      { t: "em", c: ["a"] },
      " ",
      { t: "strong", c: ["b"] },
      " ",
      { t: "em", c: ["c"] },
      " ",
      { t: "strong", c: ["d"] },
      " ",
      { t: "del", c: ["e"] },
      " ",
      { t: "code", text: "f *g*" },
    ]);
  });

  it("leaves snake_case, lone stars and escapes alone", () => {
    expect(parseInline("snake_case_name 2 * 3 \\*not\\*")).toEqual(["snake_case_name 2 * 3 *not*"]);
  });

  it("links, autolinks and hard breaks", () => {
    expect(parseInline("[the **docs**](https://example.com/a_(b)) <https://x.dev> line  \nnext")).toEqual([
      { t: "a", href: "https://example.com/a_(b)", c: ["the ", { t: "strong", c: ["docs"] }] },
      " ",
      { t: "a", href: "https://x.dev", c: ["https://x.dev"] },
      " line",
      { t: "br" },
      "next",
    ]);
  });

  it("drops unsafe link targets but keeps the text", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual(["click"]);
    expect(parseInline("[x](//evil.example)")).toEqual(["x"]);
    expect(parseInline("<b onclick=x>hi</b>")).toEqual(["<b onclick=x>hi</b>"]);
  });

  it("images only from this site; others become a link", () => {
    expect(parseInline("![rack](/img/rack.jpg)")).toEqual([{ t: "img", src: "/img/rack.jpg", alt: "rack" }]);
    expect(parseInline("![rack](https://cdn.example/r.jpg)")).toEqual([{ t: "a", href: "https://cdn.example/r.jpg", c: ["rack"] }]);
  });
});

describe("link safety", () => {
  it.each(["/a", "#top", "https://x.dev/p?q=1", "http://old.example", "mailto:me@example.com"])("allows %s", (h) => expect(safeHref(h)).toBe(h));
  it.each(["javascript:alert(1)", "JAVASCRIPT:x", "data:text/html,x", "//x.dev", "https://u:p@x.dev", "vbscript:x", "/a b", "/a\\b"])("refuses %s", (h) =>
    expect(safeHref(h)).toBeNull(),
  );
  it("images must be site-relative", () => {
    expect(safeImageSrc("/a.png")).toBe("/a.png");
    expect(safeImageSrc("https://x.dev/a.png")).toBeNull();
  });
});

describe("excerpt and reading time", () => {
  it("is the first paragraph as plain text, cut at a word", () => {
    expect(excerpt("# Head\n\nHello **there** [you](/x).\n\nSecond.")).toBe("Hello there you.");
    expect(excerpt(`${"word ".repeat(100)}`, 30)).toBe("word word word word word word…");
    expect(excerpt("")).toBe("");
  });

  it("counts about 220 words a minute, at least 1", () => {
    expect(readingMinutes("short")).toBe(1);
    expect(readingMinutes("w ".repeat(1100))).toBe(5);
  });
});

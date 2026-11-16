import { describe, expect, it } from "vitest";
import { editList, fieldLabel, formValue, parseIntent, rows, splitIssues, splitTags } from "./drafts";

/** What a browser would submit for a draft, using the same field names as the forms. */
function formDataOf(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe("reading form data", () => {
  it("builds rows from dotted names in index order and ignores junk", () => {
    const fd = formDataOf({
      "links.1.name": "B",
      "links.0.name": "A",
      "links.9999.name": "too-far",
      __proto__: "x",
    });
    expect(rows(fd, "links", ["name"] as const).map((x) => x.name)).toEqual(["A", "B"]);
    expect(formValue(fd, "missing")).toBe("");
  });

  it("splits tags", () => {
    expect(splitTags("os, linux,, kde plasma")).toEqual(["os", "linux", "kde plasma"]);
  });
});

describe("list buttons", () => {
  it("parses intents", () => {
    expect(parseIntent("save")).toBe("save");
    expect(parseIntent(null)).toBe("save");
    expect(parseIntent("add:links:link")).toEqual({ op: "add", list: "links", variant: "link" });
    expect(parseIntent("up:items:2")).toEqual({ op: "up", list: "items", index: 2 });
    expect(parseIntent("rm -rf")).toBeNull();
  });

  it("moves, deletes and adds, and says what to focus", () => {
    expect(editList(["a", "b", "c"], { op: "up", list: "x", index: 2 }, () => "", "")).toEqual({
      items: ["a", "c", "b"],
      focus: "btn-up-x-1",
    });
    expect(editList(["a", "b"], { op: "up", list: "x", index: 0 }, () => "", "")).toEqual({ items: ["a", "b"], focus: "btn-up-x-0" });
    expect(editList(["a", "b"], { op: "del", list: "x", index: 0 }, () => "", "")).toEqual({ items: ["b"], focus: "btn-add-x" });
    expect(editList(["a"], { op: "add", list: "links", variant: "" }, () => "n", "name")).toEqual({
      items: ["a", "n"],
      focus: "f-links-1-name",
    });
    expect(editList([], { op: "add", list: "items", variant: "" }, () => "", "").focus).toBe("f-items-0");
  });

});

describe("splitIssues", () => {
  it("puts issues on this form's fields and the rest in a summary", () => {
    const owns = (p: string) => /^(social|name|email)(\.|$)/.test(p);
    const fields = [/^social\.\d+\.[a-z]+$/, /^(name|email)$/];
    expect(
      splitIssues(
        [
          { path: "social.0.href", message: "Required" },
          { path: "social.1.name.3", message: "At most 40 characters" },
          { path: "social", message: "At most 12 links" },
          { path: "posts.0.at", message: "bad" },
        ],
        owns,
        fields,
      ),
    ).toEqual({
      errors: { "social.0.href": "Required", "social.1.name": "At most 40 characters" },
      other: ["social: At most 12 links", "posts.0.at: bad"],
    });
  });

  it("labels fields for the summary", () => {
    expect(fieldLabel("social.1.href", { social: "Link" })).toBe("Link 2 href");
    expect(fieldLabel("items.0")).toBe("Item 1");
    expect(fieldLabel("lede")).toBe("Lede");
    expect(fieldLabel("at")).toBe("Date and time");
    expect(fieldLabel("category", { category: "Category" })).toBe("Category");
  });
});

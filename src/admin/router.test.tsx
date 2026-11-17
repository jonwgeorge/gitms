import { describe, expect, it } from "vitest";
import site from "gitms-site-config";
import { defineGitms } from "../config";
import { route } from "./router";

const title = (path: string) => route(site, path ? path.split("/") : [])?.title ?? null;

describe("the admin router", () => {
  it("maps each path to its screen", () => {
    expect(title("")).toBe("Dashboard");
    expect(title("login")).toBe("Log in");
    expect(title("posts")).toBe("Posts");
    expect(title("posts/new")).toBe("New post");
    expect(title("posts/hello")).toBe("Edit post");
    expect(title("posts/hello/history")).toBe("History");
    expect(title("pages/about/history")).toBe("History");
    expect(title("redirects")).toBe("Redirects");
  });

  it("404s unknown paths and extra segments", () => {
    expect(title("nope")).toBeNull();
    expect(title("posts/hello/history/more")).toBeNull();
    expect(title("posts/hello/other")).toBeNull();
    expect(title("login/x")).toBeNull();
    expect(title("preview/posts")).toBeNull();
  });

  it("leaves out sections that aren't configured, and routes custom ones", () => {
    const bare = defineGitms({ siteUrl: "https://example.com/", sections: [{ slug: "settings", label: "Settings" }] });
    const parts = { sections: { settings: () => null } };
    expect(route(bare, ["posts"])).toBeNull();
    expect(route(bare, ["pages", "new"])).toBeNull();
    expect(route(bare, ["redirects"])).toBeNull();
    expect(route(bare, ["settings"], parts)?.title).toBe("Settings");
    expect(route(bare, ["settings"])).toBeNull();
    expect(route(bare, ["settings", "x"], parts)).toBeNull();
  });

  it("only serves previews the site can render", () => {
    expect(title("preview/posts/hello")).toBeNull();
    expect(route(site, ["preview", "posts", "hello"], { preview: { post: () => null } })?.title).toBe("Preview post");
    expect(route(site, ["preview", "pages", "about"], { preview: { post: () => null } })).toBeNull();
  });
});

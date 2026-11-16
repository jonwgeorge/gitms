// @vitest-environment node
import { NextRequest } from "next/server";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import site from "gitms-site-config";
import { defineGitms } from "../config";
import { SESSION_COOKIE, signSession } from "../core/session";
import { gitmsRedirects, withGitms } from "./next-config";
import { gitmsProxy, isAdminPath } from "./proxy";

const SECRET = "p".repeat(40);
const HASH = "scrypt:16384:8:1:vqW26xOvReRKchX3a-R_XA:LBpgB10TGQqQu3OBgE_bQwcNx9SWCs67c73F47bT2rn5D-1bwjxVQ1WomVa305xTIQX0YqoxGPNFaDdSG2_v3g";

const request = (path: string, cookie?: string, method = "GET") =>
  new NextRequest(`https://www.example.com${path}`, { method, headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });

describe("gitmsProxy", () => {
  beforeEach(() => {
    vi.stubEnv("GITMS_ADMIN_PASSWORD_HASH", HASH);
    vi.stubEnv("GITMS_ADMIN_SESSION_SECRET", SECRET);
    vi.stubEnv("GITMS_ADMIN_STORE", "fs");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/admin", "/admin/posts", "/admin/pages/about"])("GET %s signed out → 303 to the login page", (path) => {
    const res = gitmsProxy(request(path));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.example.com/admin/login");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects an expired cookie and a POST as a 303, and lets a valid session through", () => {
    expect(gitmsProxy(request("/admin/posts", signSession(SECRET, Date.now() - 13 * 3600_000))).status).toBe(303);
    expect(gitmsProxy(request("/admin/posts", undefined, "POST")).status).toBe(303);
    const ok = gitmsProxy(request("/admin/posts", signSession(SECRET)));
    expect(ok.headers.get("location")).toBeNull();
    expect(ok.headers.get("x-middleware-next")).toBe("1");
  });

  it("serves the login page signed out, and sends a signed-in admin to the dashboard", () => {
    expect(gitmsProxy(request("/admin/login")).headers.get("x-middleware-next")).toBe("1");
    expect(gitmsProxy(request("/admin/login", signSession(SECRET))).headers.get("location")).toBe("https://www.example.com/admin");
  });

  it("lets requests through when unconfigured, so the page can say what's missing", () => {
    vi.stubEnv("GITMS_ADMIN_SESSION_SECRET", "");
    expect(gitmsProxy(request("/admin/posts")).headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves the rest of the site alone", () => {
    const res = gitmsProxy(request("/administrator"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/x")).toBe(true);
    expect(isAdminPath("/admins")).toBe(false);
  });
});

describe("withGitms", () => {
  const root = join(__dirname, "..", "..", "test", "fixtures");

  it("serves the editable redirects first, skipping one whose old URL is live again, then the built-in ones", async () => {
    const cms = defineGitms({
      siteUrl: "https://example.com/",
      pages: { file: "content/pages.json" },
      posts: { file: "content/posts.json", route: "/blog/:slug", fields: site.posts!.fields },
      redirects: { file: "content/redirects.json", builtIn: [{ source: "/feed", destination: "/rss.xml", permanent: false }] },
    });
    const out = gitmsRedirects(cms, root);
    expect(out.at(-1)).toEqual({ source: "/feed", destination: "/rss.xml", permanent: false });
    expect(out).toContainEqual({ source: "/old-about", destination: "/about", permanent: true });

    const config = withGitms(cms, { redirects: async () => [{ source: "/mine", destination: "/", permanent: false }] }, { root });
    const all = await config.redirects!();
    expect(all.at(-1)).toEqual({ source: "/mine", destination: "/", permanent: false });
  });

  it("reads a missing redirects file as empty, and names a bad one", () => {
    const missing = defineGitms({ siteUrl: "https://example.com/", redirects: { file: "content/nope.json" } });
    expect(gitmsRedirects(missing, root)).toEqual([]);
    const bad = defineGitms({ siteUrl: "https://example.com/", redirects: { file: "content/pages.json" } });
    expect(() => gitmsRedirects(bad, root)).toThrow(/content\/pages.json is invalid/);
  });

  it("aliases the config, transpiles the package, sizes uploads and marks the admin noindex", async () => {
    const config = withGitms(site, { transpilePackages: ["other"] }, { root, configFile: "./site.config.ts" });
    expect(config.transpilePackages).toEqual(["other", "gitms"]);
    expect(config.turbopack?.resolveAlias).toEqual({ "gitms-site-config": "./site.config.ts" });
    expect(config.experimental?.serverActions?.bodySizeLimit).toBe("6mb");
    const webpack = config.webpack!({ resolve: { alias: {} } }, {} as never) as { resolve: { alias: Record<string, string> } };
    expect(webpack.resolve.alias["gitms-site-config"]).toBe(join(root, "site.config.ts"));
    const headers = await config.headers!();
    expect(headers.map((h) => h.source)).toEqual(["/admin/:path*", "/admin"]);
  });
});

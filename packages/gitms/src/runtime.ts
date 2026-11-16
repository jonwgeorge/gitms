/**
 * The site's config, as `defineGitms()` returned it in the site's
 * gitms.config.ts. `withGitms()` (gitms/next-config) points the
 * `gitms-site-config` import at that file for the bundler; tests alias it too.
 */
import config from "gitms-site-config";
import type { ResolvedConfig } from "./config";

/** The resolved config for this site. */
export const cms = (): ResolvedConfig => config;

/** An admin URL: `admin()` is the dashboard, `admin("/pages/new")` a section. */
export const admin = (path: string = ""): string => `${config.basePath}${path}`;

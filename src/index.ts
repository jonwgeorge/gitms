/**
 * gitms: a small Git-backed CMS for Next.js. This entry is client-safe and
 * importable from next.config: the config, the content schemas and the
 * markdown renderer's parser. See also gitms/admin, gitms/server,
 * gitms/content, gitms/proxy and gitms/next-config.
 */
export { defineGitms, routeFor, CORE_POST_FIELDS } from "./config";
export type {
  ActivityConfig,
  BuiltInRedirect,
  CustomField,
  CustomSection,
  ExtraFile,
  GitmsConfig,
  PagesConfig,
  PostsConfig,
  RedirectsConfig,
  ResolvedConfig,
  UploadsConfig,
} from "./config";
export {
  BODY_MAX,
  DESCRIPTION_MAX,
  SLUG_PATTERN,
  contentError,
  isIsoDateTime,
  isSafeHref,
  issuesOf,
  parseContent,
  schemasFor,
  validateWith,
  type ContentIssue,
  type Page,
  type Post,
  type Redirect,
  type Validation,
} from "./core/schema";

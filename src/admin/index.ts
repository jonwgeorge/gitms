/**
 * The admin page (server): `createAdmin()` for the catch-all route and its
 * `generateMetadata`. Client building blocks for custom sections are in
 * gitms/admin/ui.
 */
export { createAdmin, generateMetadata, ADMIN_ROBOTS, route } from "./router";
export type { AdminComponents, SectionComponent } from "./components";
export { AdminShell } from "./AdminShell";

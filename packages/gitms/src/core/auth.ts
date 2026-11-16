/**
 * The session check every admin page and server action runs for itself (the
 * proxy redirect is only the first line). Server-only.
 */
import { cookies } from "next/headers";
import { adminConfig, type AdminConfig } from "./env";
import { SESSION_COOKIE, verifySession } from "./session";

export type AdminGate =
  | { readonly state: "unconfigured"; readonly missing: readonly string[] }
  | { readonly state: "anonymous" }
  | { readonly state: "admin"; readonly config: Extract<AdminConfig, { configured: true }> };

export async function adminGate(): Promise<AdminGate> {
  const config = adminConfig();
  if (!config.configured) return { state: "unconfigured", missing: config.missing };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, config.sessionSecret) ? { state: "admin", config } : { state: "anonymous" };
}

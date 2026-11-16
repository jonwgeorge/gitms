"use server";

/**
 * Login and logout. Every admin action checks the session itself before doing
 * anything: the proxy only guards admin URLs, but an action can be POSTed to
 * from any route. CSRF: the cookie is SameSite=Strict and scoped to the admin
 * path, and Next checks the Origin of every action request.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfig } from "../../core/env";
import { verifyPassword } from "../../core/password";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "../../core/session";
import { clientIp, failureDelay, recordSuccess, reserveAttempt } from "../../core/throttle";
import { admin, cms } from "../../runtime";

export type LoginState = { readonly error: string | null };

const NOT_CONFIGURED = "The admin is not configured on this server, so nothing can be saved.";
const WRONG_PASSWORD = "That password didn't work.";
const TOO_MANY = "Too many attempts. Wait 15 minutes and try again.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const config = adminConfig();
  if (!config.configured) return { error: NOT_CONFIGURED };
  const ip = clientIp(await headers(), cms().clientIpHeader);
  // Count the attempt before the async scrypt check, so parallel requests can't all pass the limit.
  if (!reserveAttempt(ip)) {
    await failureDelay();
    return { error: TOO_MANY };
  }
  if (!(await verifyPassword(formData.get("password"), config.passwordHash))) {
    await failureDelay();
    return { error: WRONG_PASSWORD };
  }
  recordSuccess(ip);
  (await cookies()).set(SESSION_COOKIE, signSession(config.sessionSecret), sessionCookieOptions(cms().basePath));
  redirect(admin());
}

export async function logout(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(cms().basePath), maxAge: 0, expires: new Date(0) });
  redirect(admin("/login"));
}

/**
 * The admin's first line of defence, for the site's `proxy.ts`:
 *
 *   export { gitmsProxy as proxy } from "gitms/proxy";
 *   export const config = { matcher: ["/admin", "/admin/:path*"] };
 *
 * (Next reads `matcher` statically, so it has to be written out; keep it in
 * step with `basePath`.) Signed-out requests go to the login page, and every
 * admin response is marked noindex and no-store. Pages and server actions
 * check the session again themselves.
 */
import { NextResponse, type NextRequest } from "next/server";
import { adminConfig } from "../core/env";
import { SESSION_COOKIE, verifySession } from "../core/session";
import { admin, cms } from "../runtime";

/** Whether `pathname` is the admin or under it. */
export const isAdminPath = (pathname: string, basePath: string = cms().basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`);

export function gitmsProxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (!isAdminPath(pathname)) return NextResponse.next();
  const login = admin("/login");
  const config = adminConfig();
  const authed = config.configured && verifySession(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret);
  // 303 so a POST (an expired session submitting a form) becomes a GET.
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  let response: NextResponse;
  if (pathname === login) response = authed ? to(admin()) : NextResponse.next();
  else if (!config.configured) response = NextResponse.next(); // the page explains what's missing
  else if (!authed) response = to(login);
  else response = NextResponse.next();

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export { gitmsProxy as proxy } from "gitms/proxy";

// Next reads this statically, so it's written out: keep it in step with basePath.
export const config = { matcher: ["/admin", "/admin/:path*"] };

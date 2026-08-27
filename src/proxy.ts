import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

/**
 * Next 16 renamed middleware.ts to proxy.ts. Same mechanism.
 *
 * This does the OPTIMISTIC check only — "is there a session at all" — and
 * bounces anonymous traffic away from /app. Next's own guidance is explicit
 * that Proxy is not an authorization layer; the real permission checks run
 * per request in the DAL (src/server/context.ts).
 *
 * It imports only the edge-safe half of the auth config, so Prisma, bcrypt
 * and the Neon driver never enter the edge bundle.
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand).*)"],
};

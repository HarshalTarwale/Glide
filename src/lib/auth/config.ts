import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the auth config.
 *
 * proxy.ts runs on the edge runtime and cannot import Prisma, bcrypt or the
 * Neon driver. Splitting the config lets the proxy do its optimistic
 * "is there a session at all" check without pulling the database layer into
 * the edge bundle. The real authorization happens server-side in the DAL.
 * See docs/architecture.md §2.1.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * Optimistic gate only. Next's own guidance is explicit that Proxy is not
     * a full authorization solution — it exists here to bounce anonymous
     * traffic away from /app, not to decide what a signed-in user may see.
     */
    authorized({ auth, request }) {
      // Preview mode: with no database wired up there is nothing to sign in
      // to, so /app stays open and renders the demo data. This gate turns
      // itself on the moment DATABASE_URL points at a real database.
      const url = process.env.DATABASE_URL;
      const dbConfigured = Boolean(url) && !url!.includes("placeholder");
      if (!dbConfigured) return true;

      const isSignedIn = Boolean(auth?.user);
      const isOnApp = request.nextUrl.pathname.startsWith("/app");
      if (isOnApp) return isSignedIn;
      return true;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
      }
      // Switching company/tenant is a session update, not a re-login.
      if (trigger === "update" && session?.tenantId) {
        token.tenantId = session.tenantId as string;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
  providers: [], // Real providers are attached in auth.ts (Node runtime only).
} satisfies NextAuthConfig;

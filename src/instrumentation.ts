/**
 * Runs once when a new Next.js server instance starts (Node runtime only
 * here -- the edge runtime never needs this, and importing Prisma/bcrypt-
 * adjacent modules into the edge bundle is exactly what src/proxy.ts and
 * src/lib/auth/config.ts already split auth in two to avoid).
 *
 * Registers the Accounting/GL module as a subscriber to P4's domain event
 * bus (src/server/core/events.ts) -- see gl-subscriber.ts's own header for
 * why this is the intended shape: invoicing.ts never imports accounting
 * code, accounting code reaches in via events only.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerGLSubscriber } = await import("@/server/accounting/gl-subscriber");
    registerGLSubscriber();
  }
}

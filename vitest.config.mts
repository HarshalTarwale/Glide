import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Vitest does not load .env on its own. Without this, DATABASE_URL is unset
// and the RLS isolation suite silently skips instead of running for real.
loadEnv({ path: resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Real network round-trips to Neon over WebSocket -- several transactions
    // per test, each its own connection. tests/stock-ledger.test.ts is the
    // heaviest (multiple receive/deliver/adjust calls per test, each a
    // separate withTenant transaction), and observed latency varies enough
    // between runs that a tighter timeout flakes on different tests each
    // time rather than reliably catching a genuinely hung test. The default
    // 5s is tuned for pure-logic tests like the tax engine.
    testTimeout: 45000,
    hookTimeout: 45000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // "server-only" throws when imported outside Next's bundler by design
      // (it's a guard against a Server Component leaking into the client
      // bundle). Vitest runs plain Node, so it is a no-op here.
      "server-only": resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});

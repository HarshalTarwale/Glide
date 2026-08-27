import Link from "next/link";
import { Database, Info } from "lucide-react";

/**
 * Shown until a real database is connected and a user is signed in, so the
 * app never looks broken while the data layer is still being wired up.
 */
export function PreviewBanner({ dbReady }: { dbReady: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-warning/20 bg-warning-soft px-6 py-2 text-xs text-warning">
      {dbReady ? <Info className="size-3.5 shrink-0" /> : <Database className="size-3.5 shrink-0" />}
      {dbReady ? (
        <>
          <span className="font-medium">Preview mode</span>
          <span className="text-warning/80">
            Database connected but no session — screens show demo data.
          </span>
          <Link href="/login" className="font-medium underline underline-offset-2">
            Sign in
          </Link>
        </>
      ) : (
        <>
          <span className="font-medium">Preview mode</span>
          <span className="text-warning/80">
            No database connected. Add <code className="font-mono">DATABASE_URL</code> to{" "}
            <code className="font-mono">.env</code>, then run{" "}
            <code className="font-mono">npx prisma migrate deploy</code>.
          </span>
        </>
      )}
    </div>
  );
}

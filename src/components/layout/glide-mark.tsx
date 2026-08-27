import { cn } from "@/lib/utils";

/**
 * The four-point sparkle from the Glide wordmark, as a vector.
 * Used as the app icon, the favicon and the collapsed-sidebar mark.
 *
 * NOTE: public/Logo currently holds a 4.2 MB JPEG and a PNG, both raster
 * and both with spaces in the filename. Replacing them with a proper
 * exported SVG wordmark is a P0 task; this component is the interim mark.
 */
export function GlideMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-5", className)}>
      <path d="M12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12C6.627 12 12 6.627 12 0Z" />
    </svg>
  );
}

export function GlideWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 text-ink", className)}>
      <span className="font-display text-2xl leading-none tracking-tight">Glide</span>
      <GlideMark className="size-2.5 translate-y-[-0.35rem]" />
    </span>
  );
}

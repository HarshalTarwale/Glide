import Image from "next/image";
import { cn } from "@/lib/utils";
import wordmark from "../../../public/brand/glide-wordmark.png";

/**
 * The four-point sparkle from the Glide wordmark, as a vector.
 * Used wherever the full wordmark will not fit: the collapsed sidebar rail,
 * the app icon and the favicon.
 *
 * It is drawn rather than cropped from the PNG on purpose -- a four-point
 * star has empty bounding-box corners, and in the source artwork the "e"
 * sits inside the sparkle's box, so no rectangular crop can isolate it.
 */
export function GlideMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-5", className)}>
      <path d="M12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12C6.627 12 12 6.627 12 0Z" />
    </svg>
  );
}

/**
 * The real logo, optimised from public/Logo (10596x4080, 370 KB) down to
 * 720px wide and 15 KB. The artwork is pure black on a transparent ground,
 * so a CSS invert gives a clean white wordmark in dark mode with no second
 * asset to keep in sync.
 */
export function GlideWordmark({ className }: { className?: string }) {
  return (
    <Image
      src={wordmark}
      alt="Glide"
      priority
      className={cn("h-6 w-auto select-none dark:invert", className)}
    />
  );
}

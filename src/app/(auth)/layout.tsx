import { GlideWordmark } from "@/components/layout/glide-mark";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <GlideWordmark className="h-7" />
        </div>
        {children}
        <p className="mt-8 text-center text-2xs text-ink-subtle">
          Inventory, sales and invoicing for growing businesses.
        </p>
      </div>
    </div>
  );
}

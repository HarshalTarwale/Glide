import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Primary actions are INK, not the accent colour. That is the editorial
 * decision at the heart of the Glide look: black buttons on warm paper.
 * The accent is reserved for links, focus and state.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-ink text-ink-inverse hover:bg-ink/88 active:bg-ink/80",
        secondary:
          "bg-surface text-ink border border-hairline-strong hover:bg-surface-sunken active:bg-surface-sunken",
        ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink active:bg-surface-sunken",
        accent: "bg-accent text-accent-ink hover:bg-accent-hover",
        danger: "bg-danger text-white hover:brightness-110 active:brightness-95",
        link: "text-accent underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-control px-3 text-sm",
        lg: "h-10 px-4 text-base",
        icon: "h-control w-[var(--control-h)] p-0",
        iconSm: "h-8 w-8 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };

import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../cn.js";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1 rounded-lg px-2 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-warm-100 text-warm-800",
        success: "bg-green-50 text-green-700",
        warning: "bg-orange-500/15 text-night-900",
        danger: "bg-red-50 text-red-700",
        dark: "bg-night-900 text-white",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

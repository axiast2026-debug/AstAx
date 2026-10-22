import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn.js";

/**
 * One orange button per screen (the main action); white text never goes on
 * orange (2.9:1). The small size is 36 px to the eye and 44 px to the finger.
 */
export const buttonVariants = cva(
  "press relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-900 disabled:cursor-not-allowed disabled:bg-warm-200 disabled:text-warm-600 disabled:shadow-none",
  {
    variants: {
      variant: {
        primary: "bg-orange-500 text-night-900 hover:bg-orange-400",
        secondary: "bg-night-900 text-white hover:bg-night-800",
        outline:
          "bg-white text-night-900 shadow-[inset_0_0_0_1px_var(--color-night-900)] hover:bg-warm-100",
        ghost: "text-night-900 hover:bg-warm-100",
        danger: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        sm: "h-9 px-3 text-sm after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        md: "h-11 px-4 text-base",
        lg: "h-13 px-6 text-base",
      },
      full: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, full, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, full }), className)} {...props} />;
}

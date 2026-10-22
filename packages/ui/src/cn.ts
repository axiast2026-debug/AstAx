import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type scale of styles.css: without it `text-note` would pass for a colour and drop `text-warm-600`.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["price", "screen", "section", "body", "table", "label", "note"] } },
});

/** Joins class names, letting later Tailwind classes override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

import { useId, type ReactNode } from "react";
import { cn } from "../cn.js";
import { Icon } from "./icon.js";

/**
 * Dan, 2026-10-30: the description of a box or a page sits behind a small «i»
 * next to its title, instead of a line of text under it. It opens on mouse
 * hover, on keyboard focus and on a tap (the tap focuses the button); no
 * script, so it works in server components too. The button has a short name
 * (`label`, from the translations) so the title keeps its own name, and the
 * explanation as its description.
 */
export function InfoTip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("group relative ml-1.5 inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex rounded-full text-warm-500 hover:text-night-900 focus-visible:text-night-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
      >
        <Icon name="info" size={18} />
      </button>
      <span
        id={id}
        role="tooltip"
        className="invisible absolute top-full left-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-warm-200 bg-white p-3 text-left text-sm font-normal normal-case tracking-normal text-warm-700 opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}

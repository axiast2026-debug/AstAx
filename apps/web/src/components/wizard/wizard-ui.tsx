import { cn, Icon } from "@astax/ui";
import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * A choice of the wizard as a card to tap (design system, ChoiceCard): the
 * whole card is the label of its radio; the choice shows with a night-blue
 * border and dot, never orange.
 */
export function ChoiceCard({
  id,
  label,
  text,
  ...input
}: {
  id: string;
  label: string;
  text?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id">) {
  return (
    <label
      htmlFor={id}
      className="press flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-night-900)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-night-900"
    >
      <input
        id={id}
        type="radio"
        className="mt-0.5 size-5 shrink-0 appearance-none rounded-full border-2 border-warm-600 bg-white checked:border-[6px] checked:border-night-900 focus-visible:outline-none"
        {...input}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-body font-semibold text-night-900">{label}</span>
        {text ? <span className="text-table text-warm-600">{text}</span> : null}
      </span>
    </label>
  );
}

/** A choice that leads to another page (screen 1): the same card, as a link. */
export function ChoiceLink({
  href,
  label,
  text,
  selected,
}: {
  href: string;
  label: string;
  text: string;
  selected: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "press flex min-h-11 items-center gap-3 rounded-xl bg-white p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-900",
        selected
          ? "shadow-[inset_0_0_0_2px_var(--color-night-900)]"
          : "shadow-[inset_0_0_0_1px_var(--color-warm-200)]",
      )}
    >
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-body font-semibold text-night-900">{label}</span>
        <span className="text-table text-warm-600">{text}</span>
      </span>
      <Icon name="arrowRight" className="text-warm-600" />
    </Link>
  );
}

/**
 * The button of a screen, fixed at the bottom on the phone above the menu
 * bar (design system, «pulsante fisso in basso»), with the note that every
 * step is saved.
 */
export function StickyActions({
  children,
  note,
  aboveMenu,
}: {
  children: ReactNode;
  note: string;
  /** The private customer has the menu as a bar at the bottom of the phone. */
  aboveMenu: boolean;
}) {
  return (
    <div
      className={cn(
        "sticky z-10 -mx-4 flex flex-col gap-2 border-t border-warm-200 bg-warm-50/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none",
        aboveMenu ? "bottom-11 md:bottom-auto" : "bottom-0",
      )}
    >
      {children}
      <p className="text-center text-note text-warm-600 md:text-left">{note}</p>
    </div>
  );
}

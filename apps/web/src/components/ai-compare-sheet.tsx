"use client";

import { buttonVariants, Icon } from "@astax/ui";
import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

function ConfirmButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={buttonVariants({ size: "lg", full: true })}
    >
      {pending ? (
        <>
          <Icon
            name="spinner"
            size={20}
            className="shrink-0 animate-spin motion-reduce:animate-pulse"
          />
          {busy}
        </>
      ) : (
        label
      )}
    </button>
  );
}

/**
 * PRES-06, FEE-01: the AI comparison asks first, in a sheet from the bottom,
 * with the fee that goes up. Without scripts the trigger is a plain link to
 * the confirmation page; the native dialog traps the focus and closes on Esc.
 */
export function AiCompareSheet({
  href,
  trigger,
  title,
  confirm,
  busy,
  back,
  action,
  children,
}: {
  href: string;
  trigger: string;
  title: string;
  confirm: string;
  busy: string;
  back: string;
  action: (formData: FormData) => Promise<void>;
  /** The fee before and after, and the hidden fields of the form. */
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <a
        href={href}
        className={buttonVariants({ variant: "outline" })}
        onClick={(event) => {
          if (!dialog.current) return;
          event.preventDefault();
          dialog.current.showModal();
        }}
      >
        <Icon name="sparkle" size={20} />
        {trigger}
      </a>
      <dialog
        ref={dialog}
        aria-labelledby="ai-sheet-title"
        className="sheet-in m-0 mt-auto w-full max-w-none rounded-t-3xl bg-white p-0 text-night-900 shadow-lg sm:m-auto sm:max-w-lg sm:rounded-3xl"
        onClick={(event) => {
          // A tap on the scrim closes it, like «Torna alle offerte».
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <form action={action} className="flex flex-col gap-4 px-4 pt-6 pb-8 sm:px-6">
          <span aria-hidden className="h-1 w-10 self-center rounded-full bg-warm-200 sm:hidden" />
          <h3 id="ai-sheet-title" className="font-display text-screen font-extrabold">
            {title}
          </h3>
          {children}
          <ConfirmButton label={confirm} busy={busy} />
          <button
            type="button"
            className={buttonVariants({ variant: "ghost", full: true })}
            onClick={() => dialog.current?.close()}
          >
            {back}
          </button>
        </form>
      </dialog>
    </>
  );
}

"use client";

import { buttonVariants, Icon } from "@astax/ui";
import { useFormStatus } from "react-dom";

/**
 * A submit button that says what is happening while the form is sent
 * («Sigillo la busta…»): a spinner, or a pulse with «reduce motion».
 */
export function PendingButton({
  label,
  busy,
  name,
  value,
  variant,
}: {
  label: string;
  busy: string;
  name?: string;
  value?: string;
  variant?: "primary" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending || undefined}
      className={buttonVariants({ variant, size: "lg", full: true })}
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

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
  size = "lg",
  full = true,
}: {
  label: string;
  busy: string;
  name?: string;
  value?: string;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  full?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending || undefined}
      className={buttonVariants({ variant, size, full })}
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

"use client";

import { buttonVariants } from "@astax/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * «Mandami un altro codice» on the pages of a link (decision 42): the code
 * left on its own with the opening, so the button waits otp.resendWaitSeconds
 * counted from the server's clock, telling how long. The API refuses an early
 * call anyway (SIC-05): this only spares the customer an error.
 */
export function ResendCodeButton({
  resendAt,
  serverNow,
  label,
}: {
  resendAt: string | null;
  serverNow: string;
  label: string;
}) {
  const t = useTranslations("linkCode");
  const wait = resendAt ? Math.max(0, Date.parse(resendAt) - Date.parse(serverNow)) : 0;
  const [left, setLeft] = useState(wait);
  useEffect(() => {
    if (wait === 0) return;
    const start = performance.now();
    const tick = () => setLeft(Math.max(0, wait - (performance.now() - start)));
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [wait]);
  const seconds = Math.ceil(left / 1000);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="submit"
        disabled={seconds > 0}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        {label}
      </button>
      {seconds > 0 ? (
        <p className="text-label text-warm-600" aria-live="polite">
          {t("resendIn", { seconds })}
        </p>
      ) : null}
    </div>
  );
}

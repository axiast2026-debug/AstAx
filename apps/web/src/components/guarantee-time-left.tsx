"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * GAR-02, the last day: the hours and minutes left until 23:59:59 in Rome,
 * counted from the server's clock (the device only measures the time passed
 * since the page arrived). At the end the page reloads to show the offer grey.
 */
export function GuaranteeTimeLeft({
  expiresAt,
  serverNow,
}: {
  expiresAt: string;
  serverNow: string;
}) {
  const t = useTranslations("offersPanel");
  const router = useRouter();
  const end = Date.parse(expiresAt);
  const [left, setLeft] = useState(() => Math.max(0, end - Date.parse(serverNow)));
  useEffect(() => {
    const start = performance.now();
    const at = Date.parse(serverNow);
    const tick = () => {
      const ms = Math.max(0, end - (at + performance.now() - start));
      setLeft(ms);
      if (ms === 0) router.refresh();
    };
    // Minutes are shown: twice a minute is enough.
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [end, serverNow, router]);
  const minutes = Math.ceil(left / 60_000);
  return (
    <span className="tabular">
      {t("timeLeft", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })}
    </span>
  );
}

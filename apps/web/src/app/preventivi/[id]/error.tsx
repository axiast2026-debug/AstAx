"use client";

import { buttonVariants, Icon } from "@astax/ui";
import { useTranslations } from "next-intl";

/**
 * Something went wrong on a request's page (design, «Errore»): what the
 * customer entered is saved; retry, or write to the support.
 */
export default function RequestError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("states");
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-12 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-700">
        <Icon name="warning" size={28} />
      </span>
      <h1 className="font-display text-screen font-extrabold">{t("errorTitle")}</h1>
      <p className="text-body text-warm-600">{t("errorText")}</p>
      <button
        type="button"
        onClick={reset}
        className={buttonVariants({ variant: "secondary", size: "lg" })}
      >
        <Icon name="refresh" />
        {t("retry")}
      </button>
      <a
        href="/assistenza"
        className="inline-flex min-h-11 items-center text-label font-semibold underline"
      >
        {t("support")}
      </a>
    </div>
  );
}

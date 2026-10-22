import { getTranslations } from "next-intl/server";

/**
 * While a request loads (design system, Skeleton): still grey blocks, no
 * shimmer; the content then comes in with a fade.
 */
export default async function Loading() {
  const t = await getTranslations("states");
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8"
    >
      <span className="sr-only">{t("loading")}</span>
      <span aria-hidden className="h-8 w-2/3 rounded-lg bg-warm-100" />
      <span aria-hidden className="h-40 rounded-2xl bg-warm-100" />
      <span aria-hidden className="h-24 rounded-2xl bg-warm-100" />
      <span aria-hidden className="h-24 rounded-2xl bg-warm-100" />
    </div>
  );
}

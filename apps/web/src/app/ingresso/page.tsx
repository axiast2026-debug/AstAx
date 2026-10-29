import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorSummary } from "@/components/form";
import { publicApi } from "@/lib/public-api";
import { startOnboarding } from "./actions";
import { OnboardingForm, type OnboardingKind } from "./onboarding-form";

/**
 * «Lavora con AstAx» (phase 7): an agency or a broker asks to enter. The
 * data first; then, on the private link, the contracts (Dan, 2026-10-29: no
 * IBAN and no professional liability policy at the entry).
 */
export default async function OnboardingStartPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; errore?: string }>;
}) {
  const query = await searchParams;
  const kind: OnboardingKind =
    query.tipo === "BROKER" ? "BROKER" : query.tipo === "E" ? "E" : "AGENCY";
  const type = kind === "AGENCY" ? "AGENCY" : "BROKER";
  const t = await getTranslations("onboarding");
  const { status, body } = await publicApi<{ companies: { id: string; name: string }[] }>(
    `/onboarding/options?type=${type}`,
  );
  if (status !== 200) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-lg font-bold">{t("brand")}</p>
      <h1 className="mt-4 text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-warm-600">{t("intro")}</p>
      <nav aria-label={t("typeChoice")} className="mt-4 flex gap-4 text-sm">
        {(["AGENCY", "BROKER", "E"] as const).map((x) => (
          <Link
            key={x}
            href={`/ingresso?tipo=${x}`}
            aria-current={x === kind ? "page" : undefined}
            className={x === kind ? "font-semibold underline" : "underline"}
          >
            {t(`types.${x}`)}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <ErrorSummary codes={query.errore} />
        <OnboardingForm kind={kind} companies={body.companies} action={startOnboarding} />
      </div>
    </main>
  );
}

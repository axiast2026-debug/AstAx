import { buttonVariants, cn, Icon, type IconName } from "@astax/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { eur } from "@/components/public-home";
import { PublicPage } from "@/components/public-shell";
import { publicNumbers } from "@/lib/public-pages";
import { weekdayName } from "@/lib/working-hours";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicPages.agencies");
  return { title: t("metaTitle") };
}

const BENEFITS: { key: string; icon: IconName }[] = [
  { key: "filters", icon: "checkCircle" },
  { key: "sealed", icon: "envelope" },
  { key: "fee", icon: "document" },
  { key: "issuance", icon: "clock" },
];
const NEEDS = ["rui", "mandates", "liability", "iban"] as const;

/**
 * «Per le agenzie» (pagine pubbliche of the design), open without login: what
 * AstAx brings, what is needed to enter (spec 04, onboarding) and the
 * transparency after the choice (CLA). The fee and the times from the
 * parameters (rule 7).
 */
export default async function ForAgenciesPage() {
  const t = await getTranslations("publicPages.agencies");
  const { service } = await publicNumbers();
  const values: Record<string, Record<string, string | number>> = {
    fee: { fee: eur(service.agencyFeeCents), day: weekdayName(service.remittanceDay) },
    issuance: { hours: service.issuanceWorkingHours },
  };
  return (
    <PublicPage title={t("title")} intro={t("intro")}>
      <p className="max-w-3xl text-body">{t("lead")}</p>

      <section aria-label={t("benefitsLabel")}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <li
              key={b.key}
              className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
            >
              <span
                aria-hidden
                className="inline-flex size-11 items-center justify-center rounded-xl bg-night-900 text-white"
              >
                <Icon name={b.icon} size={22} />
              </span>
              <h2 className="text-body font-bold">
                {t(`benefits.${b.key}.title`, values[b.key] ?? {})}
              </h2>
              <p className="text-table text-warm-800">
                {t(`benefits.${b.key}.text`, values[b.key] ?? {})}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="needs-title"
          className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6"
        >
          <h2 id="needs-title" className="text-section font-bold">
            {t("needsTitle")}
          </h2>
          <ul className="flex flex-col gap-2">
            {NEEDS.map((n) => (
              <li key={n} className="flex items-start gap-2 text-table">
                <span className="inline-flex pt-0.5 text-green-700">
                  <Icon name="check" size={18} />
                </span>
                {t(`needs.${n}`)}
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="transparency-title"
          className="on-dark flex flex-col gap-3 rounded-2xl bg-night-900 p-5 text-white lg:p-6"
        >
          <h2 id="transparency-title" className="flex items-center gap-2 text-section font-bold">
            <Icon name="envelopeOpen" size={22} />
            {t("transparencyTitle")}
          </h2>
          <p className="text-table text-night-300">{t("transparencyText")}</p>
        </section>
      </div>

      <Link href="/ingresso" className={cn(buttonVariants({ size: "lg" }), "self-start")}>
        {t("cta")}
        <Icon name="arrowRight" />
      </Link>
    </PublicPage>
  );
}

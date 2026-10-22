import { Icon } from "@astax/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { eur } from "@/components/public-home";
import { PublicPage } from "@/components/public-shell";
import { publicNumbers } from "@/lib/public-pages";
import { workingHoursText } from "@/lib/working-hours";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicPages.faq");
  return { title: t("metaTitle") };
}

const ITEMS = [
  "sealed",
  "duration",
  "cost",
  "guarantee",
  "choose",
  "ai",
  "phone",
  "deserted",
] as const;

/**
 * «Domande frequenti» (pagine pubbliche of the design), open without login:
 * the answers repeat the domain rules (BC, ASTA, GAR, PRES, FEE); every number
 * from the parameters (rule 7). Native disclosure, no script.
 */
export default async function FaqPage() {
  const t = await getTranslations("publicPages.faq");
  const { fees, service } = await publicNumbers();
  const answer = (item: (typeof ITEMS)[number]) => {
    switch (item) {
      case "duration":
        return t("items.duration.a", {
          hours: service.defaultDurationWorkingHours,
          calendar: workingHoursText(service.workingHours),
        });
      case "cost":
        return t("items.cost.a", {
          fee: eur(fees.privateCents),
          lowFee: eur(fees.lowPremiumCents),
          threshold: eur(fees.lowPremiumThresholdCents),
          ai: eur(fees.aiSupplementCents),
        });
      case "guarantee":
        return t("items.guarantee.a", { count: service.maxReconfirmations });
      case "deserted":
        return service.desertedReopenWorkingHours === null
          ? t("items.deserted.aNoReopen")
          : t("items.deserted.a", { hours: service.desertedReopenWorkingHours });
      default:
        return t(`items.${item}.a`);
    }
  };
  return (
    <PublicPage title={t("title")} intro={t("intro")}>
      <ul className="flex max-w-3xl flex-col gap-3">
        {ITEMS.map((item, i) => (
          <li key={item}>
            <details
              open={i === 0}
              className="group rounded-2xl bg-white shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-body font-bold [&::-webkit-details-marker]:hidden">
                {t(`items.${item}.q`)}
                <span className="shrink-0 text-warm-600 transition-transform group-open:rotate-180 motion-reduce:transition-none">
                  <Icon name="chevronDown" size={20} />
                </span>
              </summary>
              <p className="px-5 pb-5 text-table text-warm-800">{answer(item)}</p>
            </details>
          </li>
        ))}
      </ul>
    </PublicPage>
  );
}

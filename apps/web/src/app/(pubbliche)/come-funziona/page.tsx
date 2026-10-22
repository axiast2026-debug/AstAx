import { buttonVariants, cn, Icon, type IconName } from "@astax/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PublicPage } from "@/components/public-shell";
import { publicNumbers } from "@/lib/public-pages";
import { workingHoursText } from "@/lib/working-hours";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicPages.howItWorks");
  return { title: t("metaTitle") };
}

/** The five steps and their colour (pagine pubbliche of the design). */
const STEPS: { key: string; icon: IconName; tone: string }[] = [
  { key: "photos", icon: "camera", tone: "bg-night-900 text-white" },
  { key: "check", icon: "checkCircle", tone: "bg-night-900 text-white" },
  { key: "sealed", icon: "envelope", tone: "bg-orange-500 text-night-900" },
  { key: "opening", icon: "envelopeOpen", tone: "bg-night-900 text-white" },
  { key: "choose", icon: "shieldCheck", tone: "bg-green-700 text-white" },
];

const SEES: { key: string; icon: IconName }[] = [
  { key: "during", icon: "lock" },
  { key: "after", icon: "envelopeOpen" },
  { key: "contacts", icon: "phone" },
];

/**
 * «Come funziona» (pagine pubbliche of the design), open without login: the
 * steps of a request, who sees what, how the average saving is computed.
 * Every number comes from the parameters (rule 7).
 */
export default async function HowItWorksPage() {
  const t = await getTranslations("publicPages.howItWorks");
  const { service } = await publicNumbers();
  const values: Record<string, Record<string, string | number>> = {
    sealed: {
      hours: service.defaultDurationWorkingHours,
      agencies: service.maxInvitedAgencies,
    },
    choose: { hours: service.issuanceWorkingHours },
  };
  return (
    <PublicPage title={t("title")} intro={t("intro")}>
      <section aria-label={t("stepsLabel")} className="flex flex-col gap-4">
        <ol className="grid gap-4 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li
              key={s.key}
              className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded-xl",
                    s.tone,
                  )}
                >
                  <Icon name={s.icon} size={22} />
                </span>
                <span className="text-note font-semibold text-warm-600 uppercase">
                  {t(`steps.${s.key}.when`, values[s.key] ?? {})}
                </span>
              </span>
              <h2 className="text-body font-bold">
                <span className="tabular">{i + 1}. </span>
                {t(`steps.${s.key}.title`)}
              </h2>
              <p className="text-table text-warm-800">
                {t(`steps.${s.key}.text`, values[s.key] ?? {})}
              </p>
            </li>
          ))}
        </ol>
        <p className="flex items-start gap-2 text-table text-warm-800">
          <span className="inline-flex pt-0.5 text-warm-600">
            <Icon name="clock" size={18} />
          </span>
          {t("hours", { calendar: workingHoursText(service.workingHours) })}
        </p>
      </section>

      <section aria-labelledby="sees-title" className="flex flex-col gap-4">
        <h2 id="sees-title" className="font-display text-screen font-extrabold">
          {t("seesTitle")}
        </h2>
        <dl className="grid gap-4 md:grid-cols-3">
          {SEES.map((s) => (
            <div
              key={s.key}
              className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
            >
              <dt className="flex items-center gap-2 text-body font-bold">
                <Icon name={s.icon} size={20} />
                {t(`sees.${s.key}.k`)}
              </dt>
              <dd className="text-table text-warm-800">{t(`sees.${s.key}.v`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="saving-title"
        className="flex flex-col gap-2 rounded-2xl bg-warm-100 p-5 lg:p-6"
      >
        <h2 id="saving-title" className="text-section font-bold">
          {t("savingTitle")}
        </h2>
        <p className="max-w-3xl text-table">
          {t("savingText", { days: service.savingWindowDays })}
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href="/auth/login?as=private"
          className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
        >
          {t("cta")}
        </a>
        <Link
          href="/domande-frequenti"
          className="inline-flex min-h-11 items-center gap-1 text-label font-semibold underline"
        >
          {t("faqLink")}
          <Icon name="arrowRight" size={18} />
        </Link>
      </div>
    </PublicPage>
  );
}

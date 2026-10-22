import {
  formatEuroCents,
  formatTime,
  formatWeekdayDate,
  romeCalendarDate,
} from "@astax/shared/format";
import { buttonVariants, cn, Icon, type IconName } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CountdownRing } from "@/components/countdown-ring";
import { LiveTicker } from "@/components/live-ticker";

export interface PublicHomeData {
  serverNow: string;
  fees: {
    privateCents: number;
    aiSupplementCents: number;
    lowPremiumThresholdCents: number;
    lowPremiumCents: number;
  };
  service: {
    maxInvitedAgencies: number;
    defaultDurationWorkingHours: number;
    agencyFeeCents: number;
    issuanceWorkingHours: number;
  };
  live: null | {
    windowDays: number;
    openAuctions: number;
    offersPerAuction: number;
    featured: null | {
      province: string | null;
      vehicleType: string | null;
      envelopes: number;
      scheduledCloseAt: string;
      workingSecondsLeft: number;
      totalWorkingSeconds: number;
      pausedUntil: string | null;
      runsUntil: string | null;
    };
    ticker: {
      at: string;
      kind: "ENVELOPE" | "CLOSED";
      province: string | null;
      vehicleType: string | null;
      count: number;
    }[];
    saving: null | { percent: number; policies: number };
  };
}

const eur = (cents: number) => formatEuroCents(cents).replace(/,00(?=\s*€)/, "");

/** «AstA» with the orange «x», on night blue (design system, Logo). */
async function Logo() {
  const t = await getTranslations("publicHome");
  return (
    <span className="font-display text-2xl font-black tracking-[-0.035em] text-white">
      {t.rich("logo", { x: (c) => <span className="text-orange-400">{c}</span> })}
    </span>
  );
}

/**
 * The public home, Momento 1 (ADR 0016): what AstAx is, the auction moving
 * now, the latest true events and the numbers with what they compare to, what
 * it costs. Without enough data, or switched off, only the steady parts.
 */
export async function PublicHome({ data }: { data: PublicHomeData }) {
  const t = await getTranslations("publicHome");
  const tv = await getTranslations("agency.vehicleTypes");
  const live = data.live;
  const today = romeCalendarDate(new Date(data.serverNow));
  const when = (at: string) =>
    romeCalendarDate(new Date(at)) === today
      ? t("todayAt", { time: formatTime(at) })
      : t("dayAt", { day: formatWeekdayDate(at), time: formatTime(at) });
  const vehicle = (type: string | null) => (type && tv.has(type) ? tv(type) : t("vehicle"));
  const steps: { icon: IconName; key: string }[] = [
    { icon: "camera", key: "photos" },
    { icon: "envelope", key: "sealed" },
    { icon: "envelopeOpen", key: "opening" },
    { icon: "shieldCheck", key: "choose" },
  ];
  const featured = live?.featured ?? null;

  return (
    <div className="min-h-screen bg-warm-50">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        {t("skip")}
      </a>
      <div className="on-dark bg-night-900 text-white [clip-path:polygon(0_0,100%_0,100%_calc(100%-48px),0_100%)]">
        <header className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" aria-label={t("homeLabel")} className="inline-flex min-h-11 items-center">
            <Logo />
          </Link>
          <nav aria-label={t("pagesLabel")} className="ml-auto flex items-center gap-1 sm:gap-4">
            <a
              href="#come-funziona"
              className="hidden min-h-11 items-center text-label font-semibold sm:inline-flex"
            >
              {t("howItWorks")}
            </a>
            <a
              href="/auth/login?as=pro"
              className="hidden min-h-11 items-center text-label font-semibold md:inline-flex"
            >
              {t("proAccess")}
            </a>
            <Link
              href="/accedi"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-white hover:bg-night-800",
              )}
            >
              <Icon name="user" size={18} />
              {t("login")}
            </Link>
          </nav>
        </header>

        <main
          id="contenuto"
          className="mx-auto grid max-w-6xl gap-8 px-4 pt-6 pb-20 lg:grid-cols-12 lg:pt-12 lg:pb-28"
        >
          <div className="flex flex-col gap-5 lg:col-span-7">
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-night-800 px-3 py-1 text-label font-semibold">
              {live ? (
                <span aria-hidden className="relative inline-flex size-2">
                  <span className="live-ring absolute inset-0 rounded-full bg-orange-400" />
                  <span className="relative inline-flex size-2 rounded-full bg-orange-400" />
                </span>
              ) : (
                <Icon name="clock" size={16} />
              )}
              {live ? t("liveChip", { count: live.openAuctions }) : t("hoursChip")}
            </span>
            <h1 className="font-display text-price font-extrabold lg:text-[3.5rem] lg:leading-[1.05]">
              {t("title")}
            </h1>
            <p className="max-w-xl text-body text-night-300">
              {t("intro", {
                agencies: data.service.maxInvitedAgencies,
                hours: data.service.defaultDurationWorkingHours,
              })}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="/auth/login?as=private"
                className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
              >
                {t("cta")}
              </a>
              <a
                href="#come-funziona"
                className={cn(
                  buttonVariants({
                    variant: "outline",
                    size: "lg",
                  }),
                  "w-full bg-transparent text-white shadow-[inset_0_0_0_1px_var(--color-night-300)] hover:bg-night-800 sm:w-auto",
                )}
              >
                {t("howItWorks")}
              </a>
            </div>
            <p className="flex items-center gap-2 text-table text-night-300">
              <Icon name="lock" size={18} />
              {t("sealed")}
            </p>
          </div>

          {featured ? (
            <section
              aria-labelledby="asta-adesso"
              className="flex flex-col gap-4 rounded-3xl bg-night-800 p-5 lg:col-span-5 lg:p-6"
            >
              <h2 id="asta-adesso" className="text-label font-semibold text-night-300">
                {t("nowTitle")}
              </h2>
              <div className="flex items-center gap-4">
                <span className="lg:hidden">
                  <CountdownRing
                    time={{ ...featured, serverNow: data.serverNow }}
                    size={96}
                    onDark
                    resumeLabel={featured.pausedUntil ? when(featured.pausedUntil) : null}
                  />
                </span>
                <span className="hidden lg:block">
                  <CountdownRing
                    time={{ ...featured, serverNow: data.serverNow }}
                    size={160}
                    onDark
                    resumeLabel={featured.pausedUntil ? when(featured.pausedUntil) : null}
                  />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-body font-bold">
                    {featured.province
                      ? t("nowWhat", {
                          vehicle: vehicle(featured.vehicleType),
                          province: featured.province,
                        })
                      : vehicle(featured.vehicleType)}
                  </span>
                  <span className="text-table text-night-300">
                    {t("nowEnvelopes", { count: featured.envelopes })} ·{" "}
                    {t("closes", { when: when(featured.scheduledCloseAt) })}
                  </span>
                </span>
              </div>
              <div aria-hidden className="flex flex-wrap gap-2">
                {Array.from({ length: Math.min(featured.envelopes, 12) }, (_, i) => (
                  <span
                    key={i}
                    className="inline-flex size-9 items-center justify-center rounded-lg bg-night-700"
                  >
                    <Icon name="envelope" size={20} />
                  </span>
                ))}
              </div>
              <p className="flex items-center gap-2 text-note text-night-300">
                <Icon name="lock" size={14} />
                {t("nowSealed")}
              </p>
            </section>
          ) : null}
        </main>
      </div>

      {live && live.ticker.length > 0 ? (
        <div className="-mt-12 pt-12">
          <LiveTicker
            label={t("tickerLabel")}
            pauseLabel={t("tickerPause")}
            playLabel={t("tickerPlay")}
            items={live.ticker.map((e, i) => ({
              key: `${e.at}-${i}`,
              time: formatTime(e.at),
              where: e.province ?? "—",
              what:
                e.kind === "ENVELOPE"
                  ? t("tickerEnvelope", {
                      vehicle: vehicle(e.vehicleType).toLowerCase(),
                      n: e.count,
                    })
                  : t("tickerClosed", {
                      vehicle: vehicle(e.vehicleType).toLowerCase(),
                      count: e.count,
                    }),
            }))}
          />
        </div>
      ) : null}

      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12 lg:gap-16 lg:py-16">
        <section
          id="come-funziona"
          aria-labelledby="come-funziona-title"
          className="flex scroll-mt-4 flex-col gap-6"
        >
          <h2 id="come-funziona-title" className="font-display text-screen font-extrabold">
            {t("howItWorks")}
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li
                key={s.key}
                className="flex gap-3 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:flex-col lg:p-6"
              >
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-night-900 text-white">
                  <Icon name={s.icon} size={24} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-body font-bold">
                    {i + 1}. {t(`steps.${s.key}.title`)}
                  </span>
                  <span className="text-table text-warm-600">
                    {t(`steps.${s.key}.text`, { hours: data.service.defaultDurationWorkingHours })}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          {live ? (
            <section
              aria-labelledby="numeri"
              className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:col-span-7 lg:p-8"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="numeri" className="text-section font-bold">
                  {t("numbersTitle")}
                </h2>
                <span className="text-note text-warm-600">
                  {t("numbersUpdated", { time: formatTime(data.serverNow) })}
                </span>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className="order-2 text-table text-warm-600">{t("openNow")}</dt>
                  <dd className="order-1 font-display text-price font-extrabold tabular">
                    {live.openAuctions}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="order-2 text-table text-warm-600">
                    {t("offersAverage", { days: live.windowDays })}
                  </dt>
                  <dd className="order-1 font-display text-price font-extrabold tabular">
                    {live.offersPerAuction.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                  </dd>
                </div>
                {live.saving ? (
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <dt className="order-2 text-table text-warm-600">
                      {t("savingAverage", {
                        policies: live.saving.policies,
                        days: live.windowDays,
                      })}
                    </dt>
                    <dd className="order-1 font-display text-price font-black text-green-600 tabular">
                      {live.saving.percent >= 0
                        ? `−${live.saving.percent}%`
                        : `+${-live.saving.percent}%`}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
          <section
            aria-labelledby="costi"
            className={`flex flex-col gap-3 rounded-3xl bg-night-900 p-5 text-white lg:p-8 ${live ? "lg:col-span-5" : "lg:col-span-12"}`}
          >
            <h2 id="costi" className="text-section font-bold">
              {t("costTitle")}
            </h2>
            <p className="text-body">
              {t.rich("costText", {
                fee: eur(data.fees.privateCents),
                low: eur(data.fees.lowPremiumCents),
                threshold: eur(data.fees.lowPremiumThresholdCents),
                ai: eur(data.fees.aiSupplementCents),
                b: (c) => <b className="text-orange-400">{c}</b>,
              })}
            </p>
          </section>
        </div>

        <section
          aria-labelledby="agenzie"
          className="flex flex-col gap-4 rounded-3xl bg-night-800 p-5 text-white lg:flex-row lg:items-center lg:justify-between lg:p-8"
        >
          <span className="flex flex-col gap-2">
            <h2 id="agenzie" className="text-section font-bold">
              {t("agenciesTitle")}
            </h2>
            <span className="max-w-2xl text-table text-night-300">
              {t("agenciesText", {
                fee: eur(data.service.agencyFeeCents),
                hours: data.service.issuanceWorkingHours,
              })}
            </span>
          </span>
          <Link
            href="/ingresso"
            className={cn(
              buttonVariants({
                variant: "outline",
                size: "lg",
              }),
              "bg-transparent text-white shadow-[inset_0_0_0_1px_var(--color-night-300)] hover:bg-night-700",
            )}
          >
            {t("agenciesCta")}
            <Icon name="arrowRight" />
          </Link>
        </section>
      </div>

      <footer className="border-t border-warm-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-table text-warm-600 sm:flex-row sm:items-center sm:justify-between">
          <span>{t("footerRui")}</span>
          <nav aria-label={t("footerLabel")} className="flex gap-4">
            <Link href="/accedi" className="inline-flex min-h-11 items-center underline">
              {t("login")}
            </Link>
            <Link href="/ingresso" className="inline-flex min-h-11 items-center underline">
              {t("agenciesCta")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

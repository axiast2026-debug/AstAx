import { endOfRomeDay } from "@astax/shared/domain";
import {
  formatDate,
  formatDateTime,
  formatEuroCents,
  formatWeekdayDate,
} from "@astax/shared/format";
import { Badge, buttonVariants, CompanyLogo, GuaranteeChip, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { chooseOffer, confirmAiComparison } from "@/app/acceptance-actions";
import { AddToCalendar } from "@/components/add-to-calendar";
import { AiCompareSheet } from "@/components/ai-compare-sheet";
import { GuaranteeTimeLeft } from "@/components/guarantee-time-left";
import { OffersReveal } from "@/components/offers-reveal";
import { PendingButton } from "@/components/pending-button";
import { UNLOCK_AT } from "@/components/offers-reveal-timing";
import type { CurrentAcceptance, OfferRow, Presentation } from "@/lib/acceptance";
import { guaranteeState } from "@/lib/guarantee";
import { api } from "@/lib/auth";
import { TrademarksNote } from "@/components/trademarks-note";

const eur = (value: unknown) => formatEuroCents(Number(value) * 100).replace(/,00(?=\s*€)/, "");

/** Envelope tiles shown at most: the count says the rest. */
const MAX_TILES = 8;

interface AuctionSummary {
  reconfirmation?: { used: number; max: number };
  auction: {
    round: number;
    kind: string;
    scheduledCloseAt: string;
    closedAt: string | null;
    offers: number | null;
  } | null;
}

/** The position in the cascade: `--i` for motion.css. */
const at = (i: number) => ({ "--i": i }) as CSSProperties;

/** PRES-04: the coverage and the deductibles the agency declared. */
async function CoverageList({ coverage, open }: { coverage: OfferRow["coverage"]; open: boolean }) {
  if (!coverage) return null;
  const t = await getTranslations("offersPanel");
  const tc = await getTranslations("agency.coverage");
  const detail = (key: string, c: Record<string, unknown>): string => {
    if (key === "rca") {
      return c.limitType === "SINGLE_LIMIT"
        ? t("singleLimit", { eur: eur(c.singleLimitEur) })
        : t("separateLimits", {
            persons: eur(c.bodilyInjuryPerClaimEur),
            things: eur(c.propertyDamagePerClaimEur),
          });
    }
    if (c.included !== true) return t("excluded");
    const parts = [t("included")];
    if (Array.isArray(c.cases)) parts.push(t("cases", { count: c.cases.length }));
    if (c.capitalEur !== undefined) parts.push(t("capital", { eur: eur(c.capitalEur) }));
    if (c.coinsurancePct !== undefined) {
      parts.push(
        t("coinsurance", { pct: String(c.coinsurancePct), eur: eur(c.coinsuranceMinEur) }),
      );
    }
    if (c.deductibleEur !== undefined) parts.push(t("deductible", { eur: eur(c.deductibleEur) }));
    return parts.join(", ");
  };
  return (
    <details open={open} className="group border-t border-warm-100">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-label font-semibold [&::-webkit-details-marker]:hidden">
        {t("coverageDeductibles")}
        <Icon name="chevronDown" className="transition-transform group-open:rotate-180" />
      </summary>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pb-2 text-table">
        {Object.entries(coverage).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-warm-600">{tc.has(key) ? tc(key) : key}</dt>
            <dd>{detail(key, value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/**
 * Proposal P1, the premium line: today's premium as a dashed line, the offers
 * as dots on the same axis, the band from the cheapest to the line is the
 * saving. Decoration for the eye; screen readers get one sentence.
 */
async function PremiumLine({ currentCents, offers }: { currentCents: number; offers: OfferRow[] }) {
  const t = await getTranslations("offersPanel");
  const prices = offers.map((o) => o.annualGrossPremiumCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices, currentCents);
  const lo = min - (max - min) * 0.12;
  const hi = max + (max - min) * 0.04;
  const x = (cents: number) => `${(((cents - lo) / (hi - lo || 1)) * 100).toFixed(1)}%`;
  const saving = currentCents > min;
  return (
    <div>
      <p className="sr-only">
        {t("lineSummary", {
          current: formatEuroCents(currentCents),
          min: formatEuroCents(min),
          max: formatEuroCents(Math.max(...prices)),
        })}
      </p>
      <div aria-hidden className="relative h-32 lg:h-36">
        <div className="absolute inset-x-0 top-16 h-0.5 bg-night-700 lg:top-[4.5rem]" />
        {saving ? (
          <div
            className="cascade absolute top-[3.625rem] h-3.5 rounded bg-green-700 lg:top-[4.0625rem] lg:h-4"
            style={{ ...at(1), left: x(min), right: `calc(100% - ${x(currentCents)})` }}
          />
        ) : null}
        <div
          className="absolute top-2 bottom-2 border-l-2 border-dashed border-white"
          style={{ left: x(currentCents) }}
        />
        <span
          className="absolute top-0 text-right text-note font-semibold lg:text-label"
          style={{ right: `calc(100% - ${x(currentCents)} + 8px)` }}
        >
          {t("lineToday")}
          <br />
          <span className="tabular">{formatEuroCents(currentCents)}</span>
        </span>
        {offers.map((o, i) => {
          const cheapest = o.annualGrossPremiumCents === min;
          // Labels above and below the line, in turns, so that close prices do not overlap.
          const below = i % 2 === 1;
          return (
            <div
              key={o.id}
              className={`absolute -translate-x-1/2 ${below ? "top-[3.625rem] lg:top-[4.0625rem]" : "top-[2.375rem] lg:top-[2.5625rem]"}`}
              style={{ left: x(o.annualGrossPremiumCents) }}
            >
              <div
                className={`land flex items-center gap-1 ${below ? "flex-col-reverse" : "flex-col"}`}
                style={at(i)}
              >
                <span
                  className={`whitespace-nowrap text-note font-bold tabular lg:text-table ${cheapest ? "text-green-600" : "text-white"}`}
                >
                  <span className="hidden lg:inline">
                    {o.company.replace(/^Compagnia /, "")} ·{" "}
                  </span>
                  {eur(o.annualGrossPremiumCents / 100)}
                </span>
                <span
                  className={`size-3.5 rounded-full shadow-[0_0_0_3px_var(--color-night-900)] lg:size-4 ${cheapest ? "bg-green-600" : "bg-white"}`}
                />
              </div>
            </div>
          );
        })}
        <span className="absolute bottom-0 left-0 hidden text-note text-night-300 lg:block">
          {t("lineLowest")}
        </span>
      </div>
    </div>
  );
}

function DarkPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-3xl bg-night-900 px-4 py-5 text-white lg:p-6 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/**
 * The offers for the private requester (PRES-02…08), Momento 3 of the design:
 * the envelopes open all together the first time, the saving against the
 * premium the customer declared, the premium line (P1), then the best offer
 * per company with its guaranteed price, the AI comparison with its higher
 * fee (PRES-06) and the choice. Rows that cannot be accepted any more are
 * grey, with the reason (GAR-04); the API checks it again at the choice.
 */
export async function OffersPanel({ requestId }: { requestId: string }) {
  const t = await getTranslations("offersPanel");
  const ta = await getTranslations("aiCompare");
  const [{ body: p }, { body: current }, { body: status }] = await Promise.all([
    api<Presentation>(`/requests/${requestId}/presentation`),
    api<CurrentAcceptance>(`/requests/${requestId}/acceptance`),
    api<AuctionSummary>(`/requests/${requestId}/auction`),
  ]);
  if (p.offers.length === 0) return null;
  const auction = status.auction;
  const chosenId = current.acceptance?.offerId ?? null;
  // After the payment, or during a second offer (EMI-04), no other offer can be chosen.
  const paid = current.acceptance?.status === "PAID" || (current.acceptance?.creditCents ?? 0) > 0;
  // PRES-03: the cheapest still guaranteed, even when GAR-04 no longer lets it be accepted.
  const cheapest = p.offers.find((o) => o.block !== "EXPIRED");
  const recommendedId = p.suggestion?.recommendedOfferId;
  // FEE-02: below 200,00 € the fee is lower, so it may differ from row to row.
  const open = p.offers.filter((o) => !o.block);
  const fees = new Set(open.map((o) => o.feeCents));
  const oneFee = fees.size <= 1 ? (open[0]?.feeCents ?? 0) : null;
  const anyOpen = open.length > 0;
  // The premium the customer declared: the saving is always against it, never without it.
  const currentCents =
    cheapest && cheapest.savingCents !== null
      ? cheapest.annualGrossPremiumCents + cheapest.savingCents
      : null;
  const bestSaving =
    currentCents !== null && cheapest ? currentCents - cheapest.annualGrossPremiumCents : null;
  const live = p.offers.filter((o) => o.block !== "EXPIRED");
  // GAR-04: the expired rows stay visible, grey, after the ones that can still be chosen.
  const rows = [...live, ...p.offers.filter((o) => o.block === "EXPIRED")];

  // GAR-02, GAR-05: until when each price holds; orange from the reminder, the hours on the last day.
  const expiresAt = (o: OfferRow) => endOfRomeDay(o.guaranteeUntil).toISOString();
  const guarantee = (o: OfferRow) => {
    const state = guaranteeState(o, p.reminderDaysBefore);
    if (state === "expired") {
      return {
        state,
        title: t("guaranteeExpiredTitle", { date: formatDate(o.guaranteeUntil) }),
        detail: t("guaranteeExpiredDetail"),
      };
    }
    if (state === "lastDay") {
      return {
        state,
        title: t("guaranteeLastDayTitle"),
        detail: <GuaranteeTimeLeft expiresAt={expiresAt(o)} serverNow={p.serverNow} />,
      };
    }
    if (state === "expiring") {
      return {
        state,
        title: t("guaranteeExpiringTitle", { day: formatWeekdayDate(expiresAt(o)) }),
        detail: t("guaranteeExpiringDays", { days: o.daysLeft }),
      };
    }
    return {
      state,
      title: t("guaranteeTitle", { date: formatDate(o.guaranteeUntil) }),
      detail: t("guaranteeDays", { days: o.daysLeft }),
    };
  };
  // GAR-05: the reminder about the cheapest offer still guaranteed, until the customer chooses.
  const remind =
    cheapest && !current.acceptance && guaranteeState(cheapest, p.reminderDaysBefore) !== "ok"
      ? cheapest
      : null;

  // The opening plays once per auction round (a reconfirmation is a new round).
  const seenCookie = `astax_offers_seen_${requestId}_${auction?.round ?? 1}`;
  const animate = !(await cookies()).has(seenCookie);
  // The cards come in one after the other, 120 ms apart, only while the envelopes open.
  const enter = (i: number, className: string) => ({
    className: animate ? `cascade ${className}` : className,
    style: animate ? at(i) : undefined,
  });

  // After the closing the API counts no envelopes: one tile per company that offered.
  const envelopes = auction?.offers ?? p.offers.length;
  const closedAt = auction?.closedAt ?? auction?.scheduledCloseAt;

  const aiOffers = open.filter((o) => o.feeWithAiCents !== null);
  const aiRow = aiOffers[0];
  const aiSameFee = aiOffers.every(
    (o) => o.feeCents === aiRow?.feeCents && o.feeWithAiCents === aiRow?.feeWithAiCents,
  );
  const canCompare = p.channel === "PRIVATE" && !p.aiUsed && anyOpen && !paid && aiRow;

  const saving = (
    <div {...enter(0, "")}>
      {currentCents === null ? (
        <p className="text-body">{t("noPremium")}</p>
      ) : bestSaving !== null && bestSaving > 0 ? (
        <div className="flex flex-col gap-1">
          <span
            data-count-cents={bestSaving}
            className="font-display text-price font-black text-green-600 tabular"
          >
            {formatEuroCents(bestSaving)}
          </span>
          <span className="text-table lg:text-body">
            {t.rich("savingHero", {
              current: formatEuroCents(currentCents),
              b: (chunks) => <b>{chunks}</b>,
            })}
          </span>
        </div>
      ) : (
        <p className="text-body">
          {t.rich("noSavingHero", {
            current: formatEuroCents(currentCents),
            b: (chunks) => <b>{chunks}</b>,
          })}
        </p>
      )}
    </div>
  );

  return (
    <section id="offerte" aria-labelledby="offerte-title" className="flex flex-col gap-4 lg:gap-6">
      <h2 id="offerte-title" className="font-display text-screen font-extrabold">
        {t("readyTitle")}
      </h2>

      {remind ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-2xl bg-orange-50 p-4 shadow-[inset_0_0_0_1px_var(--color-orange-100)] lg:flex-row lg:items-center lg:gap-4 lg:px-6"
        >
          <span className="flex flex-1 items-start gap-2">
            <span className="inline-flex pt-0.5 text-orange-700">
              <Icon name="clock" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-bold text-orange-700">
                {remind.daysLeft === 0
                  ? t.rich("reminderLastDay", {
                      left: () => (
                        <GuaranteeTimeLeft expiresAt={expiresAt(remind)} serverNow={p.serverNow} />
                      ),
                    })
                  : t("reminderTitle", { day: formatWeekdayDate(expiresAt(remind)) })}
              </span>
              <span className="text-table">
                {t(remind.daysLeft === 0 ? "reminderLastDayText" : "reminderText", {
                  price: formatEuroCents(remind.annualGrossPremiumCents),
                  company: remind.company,
                  date: formatDate(remind.guaranteeUntil),
                })}
              </span>
            </span>
          </span>
          <AddToCalendar
            expiresAt={expiresAt(remind)}
            uid={`${requestId}-${remind.id}`}
            label={t("addToCalendar")}
            summary={t("calendarSummary")}
            description={t("calendarDescription", {
              price: formatEuroCents(remind.annualGrossPremiumCents),
              company: remind.company,
            })}
          />
        </div>
      ) : null}
      {auction?.kind === "RECONFIRMATION" && status.reconfirmation ? (
        <p
          role="status"
          className="flex items-start gap-3 rounded-xl bg-green-50 px-4 py-3 text-table"
        >
          <span className="inline-flex pt-0.5 text-green-700">
            <Icon name="checkCircle" />
          </span>
          <span>
            {t.rich("reconfirmed", {
              used: status.reconfirmation.used,
              max: status.reconfirmation.max,
              b: (chunks) => <b className="text-green-700">{chunks}</b>,
            })}
          </span>
        </p>
      ) : null}

      <OffersReveal
        seenCookie={seenCookie}
        animate={animate}
        className="grid gap-4 lg:grid-cols-12 lg:gap-6"
      >
        <DarkPanel className={currentCents !== null ? "lg:col-span-4" : "lg:col-span-12"}>
          {closedAt ? (
            <span className="text-label font-semibold text-night-300">
              {t("closedOn", { date: formatDateTime(closedAt) })}
            </span>
          ) : null}
          <div
            aria-hidden
            className="flex flex-wrap gap-2"
            style={animate ? ({ "--unlock-at": `${UNLOCK_AT}ms` } as CSSProperties) : undefined}
          >
            {Array.from({ length: Math.min(envelopes, MAX_TILES) }, (_, i) => (
              <span
                key={i}
                className="relative inline-flex size-11 items-center justify-center rounded-xl bg-night-800"
              >
                {animate ? (
                  <span className="unlock absolute inset-0 flex items-center justify-center">
                    <Icon name="envelope" size={26} />
                  </span>
                ) : null}
                <span
                  className={`absolute inset-0 flex items-center justify-center text-orange-400 ${animate ? "unseal" : ""}`}
                >
                  <Icon name="envelopeOpen" size={26} />
                </span>
              </span>
            ))}
          </div>
          <p className="text-table">{t("revealLine", { companies: p.offers.length })}</p>
          {currentCents === null ? saving : <div className="lg:mt-2">{saving}</div>}
        </DarkPanel>

        {currentCents !== null ? (
          <DarkPanel className="justify-center lg:col-span-8 lg:px-8">
            <PremiumLine currentCents={currentCents} offers={live} />
          </DarkPanel>
        ) : null}

        {p.suggestion ? (
          <section
            {...enter(
              1,
              "flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_2px_var(--color-night-900)] lg:col-span-12 lg:p-6",
            )}
          >
            <h3 className="flex items-center gap-2 text-label font-bold">
              <Icon name="sparkle" />
              {t("aiTitle")}
            </h3>
            <p className="whitespace-pre-line text-table">{p.suggestion.text}</p>
            <p className="text-note text-warm-600">{t("aiNote")}</p>
          </section>
        ) : null}

        <ul className="grid gap-4 lg:col-span-12 lg:grid-cols-2 lg:items-start lg:gap-6">
          {rows.map((o, i) => {
            const recommended = o.id === recommendedId;
            const g = guarantee(o);
            return (
              <li
                key={o.id}
                aria-disabled={o.block ? true : undefined}
                {...enter(
                  i + 1,
                  `flex flex-col gap-3 rounded-2xl p-4 lg:p-6 ${o.block === "EXPIRED" ? "bg-warm-100" : "bg-white"} ${
                    recommended
                      ? "shadow-[inset_0_0_0_2px_var(--color-night-900)]"
                      : "shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
                  } ${o.block ? "text-warm-600" : ""}`,
                )}
              >
                {o.id === cheapest?.id || recommended || o.id === chosenId ? (
                  <div className="flex flex-wrap gap-2">
                    {o.id === cheapest?.id ? (
                      <Badge tone="success">
                        <Icon name="trendDown" size={14} />
                        {t("cheapest")}
                      </Badge>
                    ) : null}
                    {recommended ? (
                      <Badge tone="dark">
                        <Icon name="sparkle" size={14} />
                        {t("recommended")}
                      </Badge>
                    ) : null}
                    {o.id === chosenId ? <Badge tone="dark">{t("chosen")}</Badge> : null}
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-3 lg:flex-col lg:gap-2">
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2">
                      <CompanyLogo companyId={o.companyId} name={o.company} />
                      <span className="text-body font-bold lg:text-section">{o.company}</span>
                    </span>
                    <span className="text-table text-warm-600">
                      {o.product}
                      {o.packageName ? ` · ${t("package", { name: o.packageName })}` : null}
                    </span>
                  </span>
                  <span className="font-display text-screen font-extrabold whitespace-nowrap tabular lg:text-price">
                    {formatEuroCents(o.annualGrossPremiumCents)}
                  </span>
                </div>
                <GuaranteeChip
                  size="sm"
                  className="lg:hidden"
                  state={g.state}
                  title={g.title}
                  detail={g.detail}
                />
                <GuaranteeChip
                  className="hidden self-start lg:inline-flex"
                  state={g.state}
                  title={g.title}
                  detail={g.detail}
                />
                {o.block === "TOO_LATE" ? <p className="text-table">{t("tooLate")}</p> : null}
                {o.savingCents !== null && !o.block ? (
                  <p
                    className={`text-table font-medium tabular ${o.savingCents >= 0 ? "text-green-700" : ""}`}
                  >
                    {o.savingCents >= 0
                      ? t("saving", { amount: formatEuroCents(o.savingCents) })
                      : t("noSaving", { amount: formatEuroCents(-o.savingCents) })}
                  </p>
                ) : null}
                {oneFee === null && !o.block ? (
                  <p className="text-table">{t("rowFee", { fee: formatEuroCents(o.feeCents) })}</p>
                ) : null}
                <CoverageList coverage={o.coverage} open={i === 0} />
                {o.notes ? (
                  <p className="text-table">
                    <span className="text-warm-600">{t("notes")}: </span>
                    {o.notes}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {o.pdfDocumentId ? (
                    <a
                      href={`/preventivi/${requestId}/offerte/${o.id}/preventivo`}
                      className="inline-flex min-h-11 items-center gap-1 text-label font-semibold underline underline-offset-2 hover:text-orange-700"
                      target="_blank"
                      rel="noopener"
                    >
                      <Icon name="document" size={18} />
                      {t("quote")}
                    </a>
                  ) : (
                    <span />
                  )}
                  {!o.block && !paid && o.id !== chosenId ? (
                    <form action={chooseOffer}>
                      <input type="hidden" name="requestId" value={requestId} />
                      <input type="hidden" name="offerId" value={o.id} />
                      <PendingButton
                        variant="secondary"
                        size="md"
                        full={false}
                        label={t("choose")}
                        busy={t("choosing")}
                      />
                    </form>
                  ) : null}
                  {o.id === chosenId ? (
                    <Link
                      href={`/preventivi/${requestId}/accettazione`}
                      className={buttonVariants({ variant: "secondary" })}
                    >
                      {paid ? t("seeAcceptance") : t("continueAcceptance")}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-4 lg:col-span-12">
          {canCompare ? (
            <div
              {...enter(
                p.offers.length + 1,
                "flex flex-col gap-3 rounded-2xl bg-warm-100 p-4 lg:flex-row lg:items-center lg:gap-4 lg:p-6",
              )}
            >
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 text-body font-bold">
                  <Icon name="sparkle" />
                  {t("adviceTitle")}
                </span>
                <span className="text-table">
                  {aiSameFee
                    ? t("adviceText", {
                        from: formatEuroCents(aiRow.feeCents),
                        to: formatEuroCents(aiRow.feeWithAiCents ?? aiRow.feeCents),
                      })
                    : t("adviceTextByOffer")}
                </span>
              </span>
              <AiCompareSheet
                href={`/preventivi/${requestId}/confronto-ai`}
                trigger={t("compare")}
                title={ta("title")}
                confirm={ta("confirm")}
                busy={ta("busy")}
                back={ta("back")}
                action={confirmAiComparison}
              >
                <input type="hidden" name="requestId" value={requestId} />
                {aiSameFee ? (
                  <>
                    <p className="text-body">
                      {ta("text", {
                        from: formatEuroCents(aiRow.feeCents),
                        to: formatEuroCents(aiRow.feeWithAiCents ?? aiRow.feeCents),
                      })}
                    </p>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-warm-50 px-4 py-3 text-table tabular">
                      <dt>{ta("feeWithout")}</dt>
                      <dd>{formatEuroCents(aiRow.feeCents)}</dd>
                      <dt className="font-semibold">{ta("feeWith")}</dt>
                      <dd className="font-semibold">
                        {formatEuroCents(aiRow.feeWithAiCents ?? aiRow.feeCents)}
                      </dd>
                    </dl>
                  </>
                ) : (
                  <>
                    <p className="text-body">{ta("textByOffer")}</p>
                    <div className="flex flex-col gap-1 rounded-xl bg-warm-50 px-4 py-3 text-table tabular">
                      {aiOffers.map((o) => (
                        <p key={o.id}>
                          {ta("offerFee", {
                            offer: `${o.company} · ${o.product}`,
                            from: formatEuroCents(o.feeCents),
                            to: formatEuroCents(o.feeWithAiCents ?? o.feeCents),
                          })}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </AiCompareSheet>
            </div>
          ) : null}
          <p {...enter(p.offers.length + 2, "text-note text-warm-600 lg:text-table")}>
            {oneFee !== null ? t("fee", { fee: formatEuroCents(oneFee) }) : t("feeVaries")}{" "}
            {t("agenciesHidden")}
          </p>
        </div>
      </OffersReveal>
      <TrademarksNote className="mt-4" />
    </section>
  );
}

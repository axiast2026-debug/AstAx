import { formatDate, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { chooseOffer } from "@/app/acceptance-actions";
import type { CurrentAcceptance, OfferRow, Presentation } from "@/lib/acceptance";
import { api } from "@/lib/auth";

const eur = (value: unknown) => formatEuroCents(Number(value) * 100).replace(/,00(?=\s*€)/, "");

/** PRES-04: the coverage and the deductibles the agency declared. */
async function CoverageList({ coverage }: { coverage: OfferRow["coverage"] }) {
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
    <details className="mt-2">
      <summary className="cursor-pointer text-sm underline">{t("coverage")}</summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
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
 * The offers for the private requester (PRES-02…08): the best per company,
 * saving and days left, the PDF quote, the AI comparison with its higher fee
 * (PRES-06) and the choice. Rows that cannot be accepted any more are grey,
 * with the reason (GAR-04); the API checks it again at the choice.
 */
export async function OffersPanel({ requestId }: { requestId: string }) {
  const t = await getTranslations("offersPanel");
  const [{ body: p }, { body: current }] = await Promise.all([
    api<Presentation>(`/requests/${requestId}/presentation`),
    api<CurrentAcceptance>(`/requests/${requestId}/acceptance`),
  ]);
  if (p.offers.length === 0) return null;
  const chosenId = current.acceptance?.offerId ?? null;
  const paid = current.acceptance?.status === "PAID";
  // PRES-03: the cheapest still guaranteed, even when GAR-04 no longer lets it be accepted.
  const cheapestId = p.offers.find((o) => o.block !== "EXPIRED")?.id;
  const recommendedId = p.suggestion?.recommendedOfferId;
  const fee = p.offers[0]?.feeCents ?? 0;
  const anyOpen = p.offers.some((o) => !o.block);
  return (
    <Card id="offerte">
      <CardTitle>{t("title")}</CardTitle>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>

      {p.suggestion ? (
        <section className="mt-4 rounded-lg border border-night-900 bg-warm-50 p-4 text-sm">
          <h3 className="font-semibold">{t("aiTitle")}</h3>
          <p className="mt-1 whitespace-pre-line">{p.suggestion.text}</p>
          <p className="mt-2 text-warm-600">{t("aiNote")}</p>
        </section>
      ) : null}

      <ul className="mt-3 divide-y divide-warm-200 text-sm">
        {p.offers.map((o) => (
          <li
            key={o.id}
            className={o.block ? "py-4 text-warm-600" : "py-4"}
            aria-disabled={o.block ? true : undefined}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {o.company} · {o.product}
                {o.id === cheapestId ? (
                  <Badge tone="success" className="ml-2">
                    {t("cheapest")}
                  </Badge>
                ) : null}
                {o.id === recommendedId ? (
                  <Badge tone="dark" className="ml-2">
                    {t("recommended")}
                  </Badge>
                ) : null}
                {o.id === chosenId ? (
                  <Badge tone="warning" className="ml-2">
                    {t("chosen")}
                  </Badge>
                ) : null}
              </span>
              <span className="text-lg font-semibold tabular">
                {formatEuroCents(o.annualGrossPremiumCents)}
              </span>
            </div>
            {o.packageName ? <div>{t("package", { name: o.packageName })}</div> : null}
            <div>
              {o.block === "EXPIRED"
                ? t("expired", { date: formatDate(o.guaranteeUntil) })
                : t("daysLeft", { days: o.daysLeft, date: formatDate(o.guaranteeUntil) })}
            </div>
            {o.block === "TOO_LATE" ? <div>{t("tooLate")}</div> : null}
            {o.savingCents !== null && !o.block ? (
              <div>
                {o.savingCents >= 0
                  ? t("saving", { amount: formatEuroCents(o.savingCents) })
                  : t("noSaving", { amount: formatEuroCents(-o.savingCents) })}
              </div>
            ) : null}
            <CoverageList coverage={o.coverage} />
            {o.notes ? (
              <p className="mt-2">
                <span className="text-warm-600">{t("notes")}: </span>
                {o.notes}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {o.pdfDocumentId ? (
                <a
                  href={`/preventivi/${requestId}/offerte/${o.id}/preventivo`}
                  className="underline"
                  target="_blank"
                  rel="noopener"
                >
                  {t("quote")}
                </a>
              ) : null}
              {!o.block && !paid && o.id !== chosenId ? (
                <form action={chooseOffer}>
                  <input type="hidden" name="requestId" value={requestId} />
                  <input type="hidden" name="offerId" value={o.id} />
                  <Button type="submit" size="sm">
                    {t("choose")}
                  </Button>
                </form>
              ) : null}
              {o.id === chosenId ? (
                <Link
                  href={`/preventivi/${requestId}/accettazione`}
                  className={buttonVariants({ size: "sm" })}
                >
                  {paid ? t("seeAcceptance") : t("continueAcceptance")}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm">{t("fee", { fee: formatEuroCents(fee) })}</p>

      {p.channel === "PRIVATE" && !p.aiUsed && anyOpen && !paid ? (
        <div className="mt-4 border-t border-warm-200 pt-4">
          <p className="text-sm">{t("compareIntro")}</p>
          <Link
            href={`/preventivi/${requestId}/confronto-ai`}
            className={`${buttonVariants({ variant: "outline" })} mt-3`}
          >
            {t("compare")}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

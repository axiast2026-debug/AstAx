import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, CompanyLogo, GuaranteeChip, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { purchaseOffer, sendForSignature } from "@/app/acceptance-actions";
import { Info } from "@/components/info";
import type { CurrentAcceptance, Presentation } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import { TrademarksNote } from "@/components/trademarks-note";

interface LinkState {
  expiresAt: string;
  expired: boolean;
  offerIds: string[];
  opened: boolean;
}

const card =
  "flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6";
const field =
  "min-h-11 w-full rounded-lg border border-warm-300 bg-white px-3 text-body focus-visible:outline-2 focus-visible:outline-orange-500";

/**
 * The intermediary's offers (Dan, 2026-10-30, ADR 0027): the best per company
 * with the PDF and «Scegli e acquista» on each. The intermediary pays at once;
 * then gives the customer's email or phone and the customer signs on a link.
 * The policy goes to issuance after the signature. UX review 2026-10-23: the
 * same cards as the private customer's offers.
 */
export async function BrokerOffersPanel({ requestId }: { requestId: string }) {
  const t = await getTranslations("brokerOffers");
  const to = await getTranslations("offersPanel");
  const [{ body: p }, { body: link }, { body: current }] = await Promise.all([
    api<Presentation>(`/requests/${requestId}/presentation`),
    api<LinkState | null>(`/requests/${requestId}/customer-link`),
    api<CurrentAcceptance>(`/requests/${requestId}/acceptance`),
  ]);
  if (p.offers.length === 0) return null;
  const a = current.acceptance;
  const bought = a?.intermediaryPurchase && a.paidAt ? a : null;
  // PRES-03: the cheapest still guaranteed, even when GAR-04 no longer lets it be accepted.
  const cheapestId = p.offers.find((o) => o.block !== "EXPIRED")?.id;
  const offers = bought ? p.offers.filter((o) => o.id === bought.offerId) : p.offers;
  const head = (o: (typeof p.offers)[number]) => (
    <div className="flex items-start gap-3">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <CompanyLogo companyId={o.companyId} name={o.company} />
          <span className="text-body font-bold">{o.company}</span>
        </span>
        <span className="text-table text-warm-600">{o.product}</span>
      </span>
      <span className="font-display text-screen font-extrabold whitespace-nowrap tabular">
        {formatEuroCents(o.annualGrossPremiumCents)}
      </span>
    </div>
  );
  return (
    <section id="offerte" aria-labelledby="offerte-title" className="flex flex-col gap-4">
      <h2 id="offerte-title" className="font-display text-screen font-extrabold">
        {bought ? t("boughtTitle") : t("title")}
        <Info>{bought ? t("boughtIntro") : t("intro")}</Info>
      </h2>
      {a?.intermediaryPurchase && !a.paidAt && a.payment ? (
        <p role="status" className="rounded-xl bg-info-50 px-4 py-3 text-table">
          {t("paymentPending")}
        </p>
      ) : null}
      <ul className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {offers.map((o) => (
          <li
            key={o.id}
            className={`${card} ${o.block === "EXPIRED" && !bought ? "bg-warm-100 text-warm-600" : ""} ${
              o.id === cheapestId && !bought
                ? "shadow-[inset_0_0_0_2px_var(--color-green-700)]"
                : ""
            }`}
          >
            {bought ? (
              <Badge tone="dark" className="self-start">
                {t("boughtBadge")}
              </Badge>
            ) : o.id === cheapestId ? (
              <Badge tone="success" className="self-start">
                <Icon name="trendDown" size={14} />
                {to("cheapest")}
              </Badge>
            ) : null}
            {head(o)}
            {bought ? null : (
              <GuaranteeChip
                size="sm"
                state={o.block === "EXPIRED" ? "expired" : "ok"}
                title={
                  o.block === "EXPIRED"
                    ? to("guaranteeExpiredTitle", { date: formatDate(o.guaranteeUntil) })
                    : to("guaranteeTitle", { date: formatDate(o.guaranteeUntil) })
                }
                detail={
                  o.block === "EXPIRED"
                    ? to("guaranteeExpiredDetail")
                    : to("guaranteeDays", { days: o.daysLeft })
                }
              />
            )}
            {!bought && o.block === "TOO_LATE" ? (
              <p className="text-table">{to("tooLate")}</p>
            ) : null}
            {o.pdfDocumentId ? (
              <a
                href={`/richieste/${requestId}/offerte/${o.id}/preventivo`}
                className="inline-flex min-h-11 items-center gap-1.5 self-start text-label font-semibold underline underline-offset-2 hover:text-orange-700"
                target="_blank"
                rel="noopener"
              >
                <Icon name="document" size={18} />
                {to("quote")}
              </a>
            ) : null}
            {!bought && !o.block ? (
              <form action={purchaseOffer}>
                <input type="hidden" name="requestId" value={requestId} />
                <input type="hidden" name="offerId" value={o.id} />
                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  aria-label={t("buyOffer", { offer: `${o.company} · ${o.product}` })}
                >
                  {t("buy")}
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {bought && a?.status === "PAID" ? (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-table">
          {t("signed")}
        </p>
      ) : null}
      {bought && a?.status === "PENDING_SIGNATURE" ? (
        <div className={card}>
          {link ? (
            <p role="status" className="flex items-start gap-2 text-table">
              <span className="inline-flex pt-0.5 text-info-700">
                <Icon name={link.expired ? "clock" : "checkCircle"} size={18} />
              </span>
              <span>
                {link.expired ? t("expired") : t("sent", { at: formatDateTime(link.expiresAt) })}{" "}
                {link.opened ? t("opened") : null}
              </span>
            </p>
          ) : null}
          <h3 className="text-body font-bold">
            {link ? t("contactsAgain") : t("contactsTitle")}
            <Info>{t("contactsIntro")}</Info>
          </h3>
          <form action={sendForSignature} className="flex flex-col gap-3">
            <input type="hidden" name="requestId" value={requestId} />
            <label className="flex flex-col gap-1 text-label font-semibold">
              {t("email")}
              <input type="email" name="email" autoComplete="off" className={field} />
            </label>
            <label className="flex flex-col gap-1 text-label font-semibold">
              {t("phone")}
              <input type="tel" name="phone" autoComplete="off" className={field} />
            </label>
            <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start">
              {t("send")}
            </Button>
          </form>
        </div>
      ) : null}
      <TrademarksNote className="mt-4" />
    </section>
  );
}

import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, GuaranteeChip, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { sendToCustomer } from "@/app/acceptance-actions";
import type { CurrentAcceptance, Presentation } from "@/lib/acceptance";
import { api } from "@/lib/auth";

interface LinkState {
  expiresAt: string;
  expired: boolean;
  offerIds: string[];
  opened: boolean;
}

const card =
  "flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6";

/**
 * The broker's offers (spec 02 «Dettaglio richiesta», decision 26): the best
 * per company with the PDF, and «Invia al cliente» of one or more of them.
 * The broker sees whether the customer opened the link, signed and paid.
 * UX review 2026-10-23: the same cards as the private customer's offers
 * (price in Inter Tight, guarantee chip, 44 px targets), one main button.
 */
export async function BrokerOffersPanel({ requestId }: { requestId: string }) {
  const t = await getTranslations("brokerOffers");
  const to = await getTranslations("offersPanel");
  const ts = await getTranslations("acceptanceStatus");
  const [{ body: p }, { body: link }, { body: current }] = await Promise.all([
    api<Presentation>(`/requests/${requestId}/presentation`),
    api<LinkState | null>(`/requests/${requestId}/customer-link`),
    api<CurrentAcceptance>(`/requests/${requestId}/acceptance`),
  ]);
  if (p.offers.length === 0) return null;
  // PRES-03: the cheapest still guaranteed, even when GAR-04 no longer lets it be accepted.
  const cheapestId = p.offers.find((o) => o.block !== "EXPIRED")?.id;
  const paid = current.acceptance?.status === "PAID";
  const selectable = p.offers.filter((o) => !o.block);
  return (
    <section id="offerte" aria-labelledby="offerte-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="offerte-title" className="font-display text-screen font-extrabold">
          {t("title")}
        </h2>
        <p className="text-table text-warm-600">{t("intro")}</p>
      </div>
      {link ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-info-50 px-4 py-3 text-table"
        >
          <span className="inline-flex pt-0.5 text-info-700">
            <Icon name={link.expired ? "clock" : "checkCircle"} size={18} />
          </span>
          <span>
            {link.expired ? t("expired") : t("sent", { at: formatDateTime(link.expiresAt) })}{" "}
            {link.opened ? t("opened") : null}{" "}
            {current.acceptance ? t("status", { status: ts(current.acceptance.status) }) : null}
          </span>
        </p>
      ) : null}
      <form action={sendToCustomer} className="flex flex-col gap-4">
        <input type="hidden" name="requestId" value={requestId} />
        <ul className="grid gap-4 lg:grid-cols-2 lg:items-start">
          {p.offers.map((o) => {
            const chosen = !o.block && !paid;
            const inLink = link?.offerIds.includes(o.id) ?? false;
            return (
              <li
                key={o.id}
                aria-disabled={o.block ? true : undefined}
                className={`${card} ${o.block === "EXPIRED" ? "bg-warm-100 text-warm-600" : ""} ${
                  o.id === cheapestId ? "shadow-[inset_0_0_0_2px_var(--color-green-700)]" : ""
                }`}
              >
                {o.id === cheapestId || inLink ? (
                  <div className="flex flex-wrap gap-2">
                    {o.id === cheapestId ? (
                      <Badge tone="success">
                        <Icon name="trendDown" size={14} />
                        {to("cheapest")}
                      </Badge>
                    ) : null}
                    {inLink ? <Badge tone="dark">{t("inLink")}</Badge> : null}
                  </div>
                ) : null}
                <label className="flex cursor-pointer items-start gap-3">
                  {chosen ? (
                    <input
                      type="checkbox"
                      name="offerId"
                      value={o.id}
                      aria-label={t("select", { offer: `${o.company} · ${o.product}` })}
                      className="mt-1 size-5 shrink-0 accent-night-900"
                    />
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-body font-bold">{o.company}</span>
                    <span className="text-table text-warm-600">{o.product}</span>
                  </span>
                  <span className="font-display text-screen font-extrabold whitespace-nowrap tabular">
                    {formatEuroCents(o.annualGrossPremiumCents)}
                  </span>
                </label>
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
                {o.block === "TOO_LATE" ? <p className="text-table">{to("tooLate")}</p> : null}
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
              </li>
            );
          })}
        </ul>
        {!paid && selectable.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Button type="submit" size="lg" className="w-full sm:w-auto">
              {t("send")}
            </Button>
            <p className="text-note text-warm-600">{t("sendHint")}</p>
          </div>
        ) : null}
      </form>
    </section>
  );
}

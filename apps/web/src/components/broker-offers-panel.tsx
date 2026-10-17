import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
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

/**
 * The broker's offers (spec 02 «Dettaglio richiesta», decision 26): the best
 * per company with the PDF, and «Invia al cliente» of one or more of them.
 * The broker sees whether the customer opened the link, signed and paid.
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
  return (
    <Card id="offerte">
      <CardTitle>{t("title")}</CardTitle>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {link ? (
        <p role="status" className="mt-3 rounded-lg bg-warm-50 p-3 text-sm">
          {link.expired ? t("expired") : t("sent", { at: formatDateTime(link.expiresAt) })}{" "}
          {link.opened ? t("opened") : null}{" "}
          {current.acceptance ? t("status", { status: ts(current.acceptance.status) }) : null}
        </p>
      ) : null}
      <form action={sendToCustomer} className="mt-3">
        <input type="hidden" name="requestId" value={requestId} />
        <ul className="divide-y divide-warm-200 text-sm">
          {p.offers.map((o) => (
            <li key={o.id} className={o.block ? "py-3 text-warm-600" : "py-3"}>
              <label className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-2 font-medium">
                  {!o.block && !paid ? (
                    <input type="checkbox" name="offerId" value={o.id} className="size-4" />
                  ) : null}
                  {o.company} · {o.product}
                  {o.id === cheapestId ? <Badge tone="success">{to("cheapest")}</Badge> : null}
                  {link?.offerIds.includes(o.id) ? <Badge tone="dark">{t("inLink")}</Badge> : null}
                </span>
                <span className="text-lg font-semibold tabular">
                  {formatEuroCents(o.annualGrossPremiumCents)}
                </span>
              </label>
              <div>
                {o.block === "EXPIRED"
                  ? to("expired", { date: formatDate(o.guaranteeUntil) })
                  : to("daysLeft", { days: o.daysLeft, date: formatDate(o.guaranteeUntil) })}
              </div>
              {o.block === "TOO_LATE" ? <div>{to("tooLate")}</div> : null}
              {o.pdfDocumentId ? (
                <a
                  href={`/richieste/${requestId}/offerte/${o.id}/preventivo`}
                  className="underline"
                  target="_blank"
                  rel="noopener"
                >
                  {to("quote")}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        {!paid ? (
          <Button type="submit" className="mt-3">
            {t("send")}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}

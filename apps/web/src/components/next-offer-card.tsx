import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { confirmNextOffer, refuseNextOffer } from "@/app/acceptance-actions";
import type { NextOffer } from "@/lib/acceptance";
import { api } from "@/lib/auth";

/**
 * EMI-04 for the customer: the agency could not issue (second offer) or the
 * data did not match (new price). The new offer, the fee, the difference to
 * pay or to get back, and the time to answer; or the full refund.
 */
export async function NextOfferCard({ requestId }: { requestId: string }) {
  const t = await getTranslations("nextOffer");
  const { status, body: p } = await api<NextOffer | null>(`/requests/${requestId}/next-offer`);
  if (status !== 200 || !p || p.status !== "PROPOSED") return null;
  return (
    <Card className="border-orange-500" id="seconda-offerta">
      <CardTitle>{t(p.kind === "SECOND_OFFER" ? "secondTitle" : "repriceTitle")}</CardTitle>
      <p className="mt-1 text-sm">
        {t(p.kind === "SECOND_OFFER" ? "secondIntro" : "repriceIntro")}
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
        <dt className="text-warm-600">{t("offer")}</dt>
        <dd>
          {p.company} · {p.product}
        </dd>
        {p.guaranteeUntil ? (
          <>
            <dt className="text-warm-600">{t("guarantee")}</dt>
            <dd>{formatDate(p.guaranteeUntil)}</dd>
          </>
        ) : null}
        <dt className="text-warm-600">{t("premium")}</dt>
        <dd className="tabular">{formatEuroCents(p.premiumCents)}</dd>
        <dt className="text-warm-600">{t("fee")}</dt>
        <dd className="tabular">{formatEuroCents(p.feeCents)}</dd>
        <dt className="font-semibold">
          {p.differenceCents > 0 ? t("toPay") : p.differenceCents < 0 ? t("toGetBack") : t("same")}
        </dt>
        <dd className="font-semibold tabular">{formatEuroCents(Math.abs(p.differenceCents))}</dd>
        <dt className="text-warm-600">{t("until")}</dt>
        <dd>{formatDateTime(p.expiresAt)}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-3">
        <form action={confirmNextOffer}>
          <input type="hidden" name="requestId" value={requestId} />
          <Button type="submit">{t("confirm")}</Button>
        </form>
        <form action={refuseNextOffer}>
          <input type="hidden" name="requestId" value={requestId} />
          <Button type="submit" variant="outline">
            {t("refuse")}
          </Button>
        </form>
      </div>
    </Card>
  );
}

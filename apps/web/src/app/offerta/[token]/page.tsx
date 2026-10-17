import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AcceptanceSteps } from "@/components/acceptance-steps";
import { ErrorSummary, Field } from "@/components/form";
import { linkProof, PROOF_HEADER, TOKEN, type LinkPage } from "@/lib/customer-link";
import { publicApi } from "@/lib/public-api";
import {
  chooseLinkOffer,
  confirmOfferCode,
  payLinkAcceptance,
  sendOfferCode,
  signLinkDocuments,
} from "../actions";

/**
 * The page the broker's customer opens from «Invia al cliente» (decision 26):
 * before the code only who sends it and the vehicle; then the offers sent,
 * the choice, the documents, the signature and the payment of the premium.
 * No account, no AI comparison, no contacts on the page.
 */
export default async function CustomerOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ codice?: string; errore?: string; esito?: string }>;
}) {
  const { token } = await params;
  if (!TOKEN.test(token)) notFound();
  const query = await searchParams;
  const t = await getTranslations("customerOffer");
  const proof = await linkProof(token);
  const { status, body: link } = await publicApi<LinkPage>(`/customer-links/${token}`, {
    headers: proof ? { [PROOF_HEADER]: proof } : {},
  });
  if (status !== 200) notFound();
  const chosen = link.acceptance ?? null;
  const chosenRow = chosen ? link.offers?.find((o) => o.id === chosen.offerId) : undefined;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-lg font-bold">{t("brand")}</p>
      <h1 className="mt-4 text-2xl font-bold">
        {t("title", { broker: link.broker, vehicle: link.vehicle })}
      </h1>
      <div className="mt-6">
        <ErrorSummary codes={query.errore} />
      </div>

      {!link.verified && link.state !== "ACTIVE" ? (
        <Card className="mt-6">
          <CardTitle>{t("expiredTitle")}</CardTitle>
          <p className="mt-2 text-sm">{t("expiredText", { broker: link.broker })}</p>
        </Card>
      ) : !link.verified ? (
        <Card className="mt-6">
          <p className="text-sm">{t("intro", { at: formatDateTime(link.expiresAt) })}</p>
          <form action={sendOfferCode} className="mt-4">
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant={query.codice ? "outline" : "primary"}>
              {query.codice ? t("sendAgain") : t("sendCode")}
            </Button>
          </form>
          {query.codice ? (
            <form action={confirmOfferCode} className="mt-4 space-y-3">
              <p role="status" className="text-sm">
                {t("codeSent")}
              </p>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="expiresAt" value={link.expiresAt} />
              <Field
                label={t("code")}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                required
              />
              <Button type="submit">{t("confirm")}</Button>
            </form>
          ) : null}
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          <Card>
            <CardTitle>{t("offersTitle")}</CardTitle>
            <p className="mt-1 text-sm text-warm-600">{t("offersIntro")}</p>
            <ul className="mt-3 divide-y divide-warm-200 text-sm">
              {(link.offers ?? []).map((o) => (
                <li key={o.id} className={o.block ? "py-4 text-warm-600" : "py-4"}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {o.company} · {o.product}
                      {o.id === chosen?.offerId ? (
                        <Badge tone="warning" className="ml-2">
                          {t("chosen")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-lg font-semibold tabular">
                      {formatEuroCents(o.annualGrossPremiumCents)}
                    </span>
                  </div>
                  <div>{t("guarantee", { date: formatDate(o.guaranteeUntil) })}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {o.pdfDocumentId ? (
                      <a
                        href={`/offerta/${token}/preventivo/${o.id}`}
                        className="underline"
                        target="_blank"
                        rel="noopener"
                      >
                        {t("quote")}
                      </a>
                    ) : null}
                    {!o.block &&
                    link.state === "ACTIVE" &&
                    chosen?.status !== "PAID" &&
                    o.id !== chosen?.offerId ? (
                      <form action={chooseLinkOffer}>
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="offerId" value={o.id} />
                        <Button type="submit" size="sm">
                          {t("choose")}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          {chosen && chosenRow ? (
            <AcceptanceSteps
              acceptance={chosen}
              row={chosenRow}
              issuer={null}
              documentBase={`/offerta/${token}/documenti`}
              changeHref={null}
              hidden={{ token }}
              signAction={signLinkDocuments}
              payAction={payLinkAcceptance}
              esito={query.esito}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}

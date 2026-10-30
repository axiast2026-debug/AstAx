import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, CompanyLogo, GuaranteeChip, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AcceptanceSteps } from "@/components/acceptance-steps";
import { ErrorSummary, Field } from "@/components/form";
import { PendingButton } from "@/components/pending-button";
import { linkProof, PROOF_HEADER, TOKEN, type LinkPage } from "@/lib/customer-link";
import { publicApi } from "@/lib/public-api";
import { TrademarksNote } from "@/components/trademarks-note";
import {
  chooseLinkOffer,
  confirmOfferCode,
  payLinkAcceptance,
  sendOfferCode,
  signLinkDocuments,
} from "../actions";

const card =
  "flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6";

/**
 * The page the broker's customer opens from «Invia al cliente» (decision 26):
 * before the code only who sends it and the vehicle; then the offers sent,
 * the choice, the documents, the signature and the payment of the premium.
 * No account, no AI comparison, no contacts on the page. UX review
 * 2026-10-23: the look of the private customer's offers (cards, price in
 * Inter Tight, guarantee chip, 44 px targets), on the phone first.
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
  const to = await getTranslations("offersPanel");
  const proof = await linkProof(token);
  const { status, body: link } = await publicApi<LinkPage>(`/customer-links/${token}`, {
    headers: proof ? { [PROOF_HEADER]: proof } : {},
  });
  if (status !== 200) notFound();
  const chosen = link.acceptance ?? null;
  const chosenRow = chosen ? link.offers?.find((o) => o.id === chosen.offerId) : undefined;
  const offers = link.offers ?? [];
  const cheapestId = offers.find((o) => o.block !== "EXPIRED")?.id;

  return (
    <div className="min-h-screen">
      <header className="bg-night-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <span className="text-lg font-bold tracking-tight">{t("brand")}</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 lg:py-10">
        <h1 className="font-display text-screen font-extrabold">
          {t("title", { broker: link.broker, vehicle: link.vehicle })}
        </h1>
        <ErrorSummary codes={query.errore} />

        {!link.verified && link.state !== "ACTIVE" ? (
          <section className={card}>
            <h2 className="flex items-center gap-2 text-section font-bold">
              <Icon name="clock" />
              {t("expiredTitle")}
            </h2>
            <p className="text-table">{t("expiredText", { broker: link.broker })}</p>
          </section>
        ) : !link.verified ? (
          <section className={card}>
            <p className="text-body">{t("intro", { at: formatDateTime(link.expiresAt) })}</p>
            {query.codice ? (
              <form action={confirmOfferCode} className="flex flex-col gap-4">
                <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-table">
                  {t("codeSent")}
                </p>
                <input type="hidden" name="token" value={token} />
                <Field
                  label={t("code")}
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                />
                <Button type="submit" size="lg" full>
                  {t("confirm")}
                </Button>
              </form>
            ) : null}
            <form action={sendOfferCode}>
              <input type="hidden" name="token" value={token} />
              {query.codice ? (
                <Button type="submit" variant="ghost" size="sm">
                  {t("sendAgain")}
                </Button>
              ) : (
                <Button type="submit" size="lg" full>
                  {t("sendCode")}
                </Button>
              )}
            </form>
          </section>
        ) : (
          <>
            <section aria-labelledby="offerte-title" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="offerte-title" className="text-section font-bold">
                  {t("offersTitle")}
                </h2>
                <p className="text-table text-warm-600">{t("offersIntro")}</p>
              </div>
              <ul className="grid gap-4 lg:grid-cols-2 lg:items-start">
                {offers.map((o) => {
                  const isChosen = o.id === chosen?.offerId;
                  const choosable =
                    !o.block && link.state === "ACTIVE" && chosen?.status !== "PAID" && !isChosen;
                  return (
                    <li
                      key={o.id}
                      className={`${card} ${o.block === "EXPIRED" ? "bg-warm-100 text-warm-600" : ""} ${
                        isChosen ? "shadow-[inset_0_0_0_2px_var(--color-night-900)]" : ""
                      }`}
                    >
                      {o.id === cheapestId || isChosen ? (
                        <div className="flex flex-wrap gap-2">
                          {o.id === cheapestId && offers.length > 1 ? (
                            <Badge tone="success">
                              <Icon name="trendDown" size={14} />
                              {to("cheapest")}
                            </Badge>
                          ) : null}
                          {isChosen ? <Badge tone="dark">{t("chosen")}</Badge> : null}
                        </div>
                      ) : null}
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 flex-col">
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
                      <GuaranteeChip
                        size="sm"
                        state={o.block === "EXPIRED" ? "expired" : "ok"}
                        title={
                          o.block === "EXPIRED"
                            ? to("guaranteeExpiredTitle", { date: formatDate(o.guaranteeUntil) })
                            : t("guarantee", { date: formatDate(o.guaranteeUntil) })
                        }
                        detail={
                          o.block === "EXPIRED"
                            ? to("guaranteeExpiredDetail")
                            : to("guaranteeDays", { days: o.daysLeft })
                        }
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {o.pdfDocumentId ? (
                          <a
                            href={`/offerta/${token}/preventivo/${o.id}`}
                            className="inline-flex min-h-11 items-center gap-1.5 text-label font-semibold underline underline-offset-2"
                            target="_blank"
                            rel="noopener"
                          >
                            <Icon name="document" size={18} />
                            {t("quote")}
                          </a>
                        ) : (
                          <span />
                        )}
                        {choosable ? (
                          <form action={chooseLinkOffer}>
                            <input type="hidden" name="token" value={token} />
                            <input type="hidden" name="offerId" value={o.id} />
                            <PendingButton
                              variant={isChosen ? "outline" : "primary"}
                              size="md"
                              full={false}
                              label={t("choose")}
                              busy={to("choosing")}
                            />
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
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
          </>
        )}
        {offers.length > 0 ? <TrademarksNote className="mt-6" /> : null}
      </main>
    </div>
  );
}

import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { goToSignature, payAcceptance } from "@/app/acceptance-actions";
import { realtimeTicket } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary } from "@/components/form";
import { LiveRefresh } from "@/components/live-refresh";
import type { CurrentAcceptance, Presentation } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { requestDetail } from "@/lib/requests";

const TO_SIGN = ["PRECONTRACTUAL_INFO", "ENGAGEMENT_LETTER"];

/**
 * The acceptance in four steps (processes 3 and 4): the summary with premium
 * and fee apart (FEE-01…03), the documents to read (LEG-05), the signature
 * at the provider and the payment (PAG-01). After the payment, the issuing
 * agency and the issuance deadline (spec 03, EMI-01).
 */
export default async function AcceptancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; esito?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.me.kind !== "PRIVATE") notFound();
  const { id } = await params;
  const query = await searchParams;
  const t = await getTranslations("acceptance");
  const tk = await getTranslations("wizard.documentKinds");
  const detail = await requestDetail(id);
  const [{ body: current }, { body: presentation }] = await Promise.all([
    api<CurrentAcceptance>(`/requests/${id}/acceptance`),
    api<Presentation>(`/requests/${id}/presentation`),
  ]);
  const a = current.acceptance;
  const row = a ? presentation.offers.find((o) => o.id === a.offerId) : undefined;
  const back = (
    <Link href={`/preventivi/${id}#offerte`} className="text-sm underline">
      {t("back")}
    </Link>
  );
  if (!a || !row) {
    return (
      <AppShell viewer={viewer}>
        <Card>
          <CardTitle>{t("title", { code: detail.code })}</CardTitle>
          <p className="mt-2 text-sm">{t("notStarted")}</p>
          <div className="mt-4">{back}</div>
        </Card>
      </AppShell>
    );
  }
  const paid = a.status === "PAID";
  const signed = a.status === "SIGNED" || paid;
  const payment = a.payment;
  const pending = !paid && payment?.status === "AUTHORIZED";
  const failed = !paid && (payment?.status === "FAILED" || query.esito === "failed");
  return (
    <AppShell viewer={viewer}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("title", { code: detail.code })}</h1>
          {back}
        </div>
        <ErrorSummary codes={query.errore} />
        {pending ? <LiveRefresh ticket={realtimeTicket} follow={{ requestId: id }} /> : null}

        {paid ? (
          <Card className="border-green-600">
            <CardTitle>{t("paidTitle")}</CardTitle>
            <p className="mt-2 text-sm">
              {t("paidText", { at: a.paidAt ? formatDateTime(a.paidAt) : "" })}
            </p>
            {current.issuer ? (
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
                <dt className="text-warm-600">{t("issuer")}</dt>
                <dd>{current.issuer.name}</dd>
                {current.issuer.pec ? (
                  <>
                    <dt className="text-warm-600">{t("pec")}</dt>
                    <dd>{current.issuer.pec}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
            {a.issuanceDeadlineAt ? (
              <p className="mt-2 text-sm">
                {t("deadline", { at: formatDateTime(a.issuanceDeadlineAt) })}
              </p>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <CardTitle>{t("summaryTitle")}</CardTitle>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
            <dt className="text-warm-600">{t("company")}</dt>
            <dd>{row.company}</dd>
            <dt className="text-warm-600">{t("product")}</dt>
            <dd>{row.product}</dd>
            <dt className="text-warm-600">{t("guarantee")}</dt>
            <dd>{formatDate(row.guaranteeUntil)}</dd>
            <dt className="text-warm-600">{t("premium")}</dt>
            <dd className="tabular">{formatEuroCents(a.premiumCents)}</dd>
            <dt className="text-warm-600">{t("fee")}</dt>
            <dd className="tabular">{a.feeCents > 0 ? formatEuroCents(a.feeCents) : t("noFee")}</dd>
            <dt className="font-semibold">{t("total")}</dt>
            <dd className="font-semibold tabular">{formatEuroCents(a.totalCents)}</dd>
          </dl>
          {!paid ? (
            <p className="mt-3 text-sm">
              <Link href={`/preventivi/${id}#offerte`} className="underline">
                {t("change")}
              </Link>{" "}
              <span className="text-warm-600">{t("changeNote")}</span>
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle>{t("documentsTitle")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">{t("documentsIntro")}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {a.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <a
                  href={`/preventivi/${id}/accettazione/documenti/${d.id}`}
                  className="underline"
                  target="_blank"
                  rel="noopener"
                >
                  {tk.has(d.kind) ? tk(d.kind) : d.kind}
                </a>
                {d.signed ? (
                  <Badge tone="success">{t("signed")}</Badge>
                ) : TO_SIGN.includes(d.kind) && !signed ? (
                  <Badge tone="warning">{t("toSign")}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>{t("signTitle")}</CardTitle>
          {signed ? (
            <p className="mt-2 text-sm">
              {t("signedAt", { at: a.signedAt ? formatDateTime(a.signedAt) : "" })}
            </p>
          ) : (
            <form action={goToSignature} className="mt-2 space-y-3 text-sm">
              <input type="hidden" name="requestId" value={id} />
              <p>{t("signText")}</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="read" required className="size-4" />
                {t("read")}
              </label>
              <Button type="submit">{t("sign")}</Button>
            </form>
          )}
        </Card>

        {!paid ? (
          <Card>
            <CardTitle>{t("payTitle")}</CardTitle>
            {!signed ? (
              <p className="mt-2 text-sm text-warm-600">{t("payAfterSign")}</p>
            ) : pending ? (
              <p role="status" className="mt-2 rounded-lg bg-green-50 p-3 text-sm">
                {t("pending")}
              </p>
            ) : (
              <form action={payAcceptance} className="mt-2 space-y-3 text-sm">
                <input type="hidden" name="requestId" value={id} />
                {failed ? (
                  <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
                    {t("failed")}
                  </p>
                ) : null}
                <p>{t("payText")}</p>
                <Button type="submit">{t("pay", { amount: formatEuroCents(a.totalCents) })}</Button>
              </form>
            )}
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { AcceptanceView, CurrentAcceptance, OfferRow } from "@/lib/acceptance";

const TO_SIGN = ["PRECONTRACTUAL_INFO", "ENGAGEMENT_LETTER"];

/**
 * The acceptance in four steps (processes 3 and 4), the same for the private
 * user and for the broker's customer on the link: the summary with premium
 * and fee apart (FEE-01…03), the documents to read (LEG-05), the signature
 * at the provider and the payment (PAG-01). After the payment, the issuing
 * agency and the issuance deadline (spec 03, EMI-01).
 */
export async function AcceptanceSteps({
  acceptance: a,
  row,
  issuer,
  documentBase,
  changeHref,
  hidden,
  signAction,
  payAction,
  esito,
}: {
  acceptance: AcceptanceView;
  row: OfferRow;
  issuer: CurrentAcceptance["issuer"];
  documentBase: string;
  changeHref: string | null;
  hidden: Record<string, string>;
  signAction: (formData: FormData) => Promise<void>;
  payAction: (formData: FormData) => Promise<void>;
  esito: string | undefined;
}) {
  const t = await getTranslations("acceptance");
  const tk = await getTranslations("wizard.documentKinds");
  const paid = a.status === "PAID";
  const signed = a.status === "SIGNED" || paid;
  const pending = !paid && a.payment?.status === "AUTHORIZED";
  const failed = !paid && (a.payment?.status === "FAILED" || esito === "failed");
  const fields = Object.entries(hidden).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
  return (
    <div id="accettazione" className="space-y-6">
      {paid ? (
        <Card className="border-green-600">
          <CardTitle>{t("paidTitle")}</CardTitle>
          <p className="mt-2 text-sm">
            {t("paidText", { at: a.paidAt ? formatDateTime(a.paidAt) : "" })}
          </p>
          {issuer ? (
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-warm-600">{t("issuer")}</dt>
              <dd>{issuer.name}</dd>
              {issuer.pec ? (
                <>
                  <dt className="text-warm-600">{t("pec")}</dt>
                  <dd>{issuer.pec}</dd>
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
        {!paid && changeHref ? (
          <p className="mt-3 text-sm">
            <Link href={changeHref} className="underline">
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
                href={`${documentBase}/${d.id}`}
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
          <form action={signAction} className="mt-2 space-y-3 text-sm">
            {fields}
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
            <form action={payAction} className="mt-2 space-y-3 text-sm">
              {fields}
              {failed ? (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
                  {t("failed")}
                </p>
              ) : null}
              <p>{a.feeCents > 0 ? t("payText") : t("payTextPremium")}</p>
              <Button type="submit">{t("pay", { amount: formatEuroCents(a.totalCents) })}</Button>
            </form>
          )}
        </Card>
      ) : null}
    </div>
  );
}

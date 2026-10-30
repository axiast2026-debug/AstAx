import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, buttonVariants, CompanyLogo, GuaranteeChip, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { AcceptanceView, CurrentAcceptance, OfferRow, PolicyRow } from "@/lib/acceptance";
import { TrademarksNote } from "@/components/trademarks-note";

const TO_SIGN = ["PRECONTRACTUAL_INFO", "ENGAGEMENT_LETTER"];

const card =
  "flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6";

/**
 * «Firma e paga» in one page (proposal P6), the same for the private user and
 * for the broker's customer on the link: on the side the offer with premium
 * and fee apart and the total (FEE-01…03); in the middle the documents to
 * read (LEG-05) and one button to sign at the provider; once signed, «Paga»
 * leads to the provider's payment page (PAG-01). Then the issuing agency and
 * the deadline (spec 03, EMI-01), and the policy once issued.
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
  policy,
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
  /** The policy issued from this acceptance, when there is one. */
  policy?: PolicyRow | null;
}) {
  const t = await getTranslations("acceptance");
  const tk = await getTranslations("wizard.documentKinds");
  const paid = a.status === "PAID";
  const signed = a.status === "SIGNED" || paid;
  // ADR 0027: the intermediary already paid; the customer only signs.
  const bought = a.intermediaryPurchase;
  const pending = !paid && a.payment?.status === "AUTHORIZED";
  const failed = !paid && (a.payment?.status === "FAILED" || esito === "failed");
  const fields = Object.entries(hidden).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
  const amount = formatEuroCents(a.dueCents > 0 ? a.dueCents : a.totalCents);

  const summary = (
    <aside aria-labelledby="riepilogo" className={`${card} lg:sticky lg:top-4`}>
      <h2 id="riepilogo" className="sr-only">
        {t("summaryTitle")}
      </h2>
      <span className="flex flex-col">
        <CompanyLogo companyId={row.companyId} name={row.company} size="detail" className="mb-2" />
        <span className="text-body font-bold">
          {row.company} · {row.product}
        </span>
        {row.packageName ? (
          <span className="text-table text-warm-600">
            {t("package", { name: row.packageName })}
          </span>
        ) : null}
      </span>
      <GuaranteeChip
        size="sm"
        state="ok"
        title={t("guaranteeUntil", { date: formatDate(row.guaranteeUntil) })}
        detail={t("guaranteeDays", { days: row.daysLeft })}
      />
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-warm-100 pt-3 text-table tabular">
        <dt>{t("premium")}</dt>
        <dd className="text-right">{formatEuroCents(a.premiumCents)}</dd>
        <dt>{a.aiUsed ? t("feeWithAi") : t("fee")}</dt>
        <dd className="text-right">{a.feeCents > 0 ? formatEuroCents(a.feeCents) : t("noFee")}</dd>
        {a.creditCents > 0 ? (
          <>
            <dt>{t("credit")}</dt>
            <dd className="text-right">−{formatEuroCents(a.creditCents)}</dd>
          </>
        ) : null}
        <dt className="self-end pt-2 text-label font-semibold">
          {a.creditCents > 0 ? (a.dueCents >= 0 ? t("due") : t("refundDue")) : t("total")}
        </dt>
        <dd className="pt-2 text-right font-display text-screen font-extrabold">
          {formatEuroCents(a.creditCents > 0 ? Math.abs(a.dueCents) : a.totalCents)}
        </dd>
      </dl>
      {!signed ? (
        <Button type="submit" size="lg" full>
          {bought ? t("signOnly") : t("signAndPay", { amount })}
        </Button>
      ) : null}
      <p className="text-note text-warm-600">{bought ? t("boughtNote") : t("onePayment")}</p>
      {!paid && changeHref ? (
        <p className="text-table">
          <Link href={changeHref} className="inline-flex min-h-11 items-center underline">
            {t("change")}
          </Link>{" "}
          <span className="text-warm-600">{t("changeNote")}</span>
        </p>
      ) : null}
    </aside>
  );

  const documents = (
    <section aria-labelledby="documenti-da-leggere" className={card}>
      <h2 id="documenti-da-leggere" className="text-section font-bold">
        {t("documentsTitle")}
      </h2>
      <p className="text-table text-warm-600">{t("documentsIntro")}</p>
      <ul className="flex flex-col">
        {a.documents.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center gap-2 border-t border-warm-100 first:border-0"
          >
            <a
              href={`${documentBase}/${d.id}`}
              className="inline-flex min-h-11 items-center gap-2 text-body underline underline-offset-2 hover:text-orange-700"
              target="_blank"
              rel="noopener"
            >
              <Icon name="document" />
              {tk.has(d.kind) ? tk(d.kind) : d.kind}
            </a>
            {d.signed ? (
              <Badge tone="success">
                <Icon name="check" size={14} />
                {t("signed")}
              </Badge>
            ) : TO_SIGN.includes(d.kind) && !signed ? (
              <Badge tone="neutral">{t("toSign")}</Badge>
            ) : null}
          </li>
        ))}
      </ul>
      {!signed ? (
        <>
          <label className="flex min-h-11 items-center gap-3 border-t border-warm-100 pt-3 text-body">
            <input type="checkbox" name="read" required className="size-5 accent-night-900" />
            {t("read")}
          </label>
          <p className="rounded-xl bg-info-50 px-4 py-3 text-table">
            {bought ? t("signOnlyText") : t("signText")}
          </p>
        </>
      ) : (
        <p className="flex items-center gap-2 text-table text-green-700">
          <Icon name="checkCircle" />
          {t("signedAt", { at: a.signedAt ? formatDateTime(a.signedAt) : "" })}
        </p>
      )}
    </section>
  );

  const outcome = policy ? (
    <section aria-labelledby="polizza-attiva" className={card}>
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-green-700 text-white">
        <Icon name="shieldCheck" size={28} />
      </span>
      <h2 id="polizza-attiva" className="font-display text-screen font-extrabold">
        {t("issuedTitle")}
      </h2>
      <p className="text-body">
        {t("issuedText", {
          number: policy.policyNumber,
          company: policy.company,
          from: formatDate(policy.startDate),
          to: formatDate(policy.endDate),
        })}
      </p>
      <Link
        href="/polizze"
        className={buttonVariants({ variant: "secondary", size: "lg", className: "self-start" })}
      >
        {t("issuedDocuments")}
      </Link>
      {policy.agency ? (
        <p className="text-table text-warm-600">
          {t("issuedContact", {
            agency: policy.agency.name,
            pec: policy.agency.pec ? ` · ${policy.agency.pec}` : "",
          })}
        </p>
      ) : null}
    </section>
  ) : paid ? (
    <section aria-labelledby="pagato" className={card}>
      <h2 id="pagato" className="flex items-center gap-2 font-display text-screen font-extrabold">
        <Icon name="checkCircle" size={28} className="text-green-700" />
        {bought ? t("boughtSignedTitle") : t("paidTitle")}
      </h2>
      <p className="text-body">
        {bought
          ? t("boughtSignedText")
          : t("paidText", { at: a.paidAt ? formatDateTime(a.paidAt) : "" })}
      </p>
      <dl className="grid gap-x-6 gap-y-1 text-table sm:grid-cols-[12rem_1fr]">
        {issuer ? (
          <>
            <dt className="text-warm-600">{t("issuer")}</dt>
            <dd className="font-semibold">{issuer.name}</dd>
            {issuer.pec ? (
              <>
                <dt className="text-warm-600">{t("pec")}</dt>
                <dd>{issuer.pec}</dd>
              </>
            ) : null}
          </>
        ) : null}
        <dt className="text-warm-600">{t("paidAmount")}</dt>
        <dd className="tabular">{formatEuroCents(a.totalCents)}</dd>
      </dl>
      {a.issuanceDeadlineAt ? (
        <p className="text-table font-semibold">
          {t("deadline", { at: formatDateTime(a.issuanceDeadlineAt) })}
        </p>
      ) : null}
    </section>
  ) : null;

  const payment =
    signed && !paid ? (
      <section aria-labelledby="pagamento" className={card}>
        <h2 id="pagamento" className="text-section font-bold">
          {t("payTitle")}
        </h2>
        {pending ? (
          <p role="status" className="rounded-xl bg-info-50 px-4 py-3 text-table">
            {t("pending")}
          </p>
        ) : (
          <form action={payAction} className="flex flex-col gap-3">
            {fields}
            {failed ? (
              <div role="alert" className="flex flex-col gap-1 rounded-xl bg-red-50 px-4 py-3">
                <p className="flex items-center gap-2 font-bold text-red-700">
                  <Icon name="warning" />
                  {t("failedTitle")}
                </p>
                <p className="text-table">{t("failed")}</p>
                <p className="text-table">
                  {t("failedGuarantee", { date: formatDate(row.guaranteeUntil) })}
                </p>
              </div>
            ) : null}
            <p className="text-table">{a.feeCents > 0 ? t("payText") : t("payTextPremium")}</p>
            <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start">
              {t("pay", { amount: formatEuroCents(a.dueCents) })}
            </Button>
          </form>
        )}
      </section>
    ) : null;

  const grid = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex flex-col gap-6">
        {outcome}
        {payment}
        {documents}
      </div>
      {summary}
    </div>
  );

  return (
    <div id="accettazione">
      {signed ? (
        grid
      ) : (
        <form action={signAction}>
          {fields}
          {grid}
        </form>
      )}
      <TrademarksNote className="mt-4" />
    </div>
  );
}

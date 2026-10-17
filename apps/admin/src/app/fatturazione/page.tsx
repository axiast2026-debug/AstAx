import { formatDate, formatEuroCents } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Badge, Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { completeRecipient } from "./actions";

interface InvoiceRow {
  id: string;
  code: string;
  series: "P" | "A" | "B" | "N";
  recipientType: "PRIVATE" | "AGENCY" | "BROKER";
  recipient: string;
  toComplete: boolean;
  issuedOn: string;
  dueOn: string | null;
  period: string | null;
  exemptCents: number;
  stampDutyCents: number;
  totalCents: number;
  sdiStatus: "TO_SEND" | "SENT" | "DELIVERED" | "REJECTED";
  credited: boolean;
  hasPdf: boolean;
}

const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * «Fatturazione» (spec 06): AstAx's invoices with the SDI state (CONT-03).
 * An invoice whose recipient lacks the fiscal data is «da completare»: the
 * back office completes it and it goes to SDI (proposal D of phase 6).
 */
export default async function InvoicingPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string; daCompletare?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("invoicing");
  const query = await searchParams;
  const onlyToComplete = query.daCompletare === "1";
  const { status, body } = await api<InvoiceRow[]>(
    `/back-office/invoices${onlyToComplete ? "?daCompletare=1" : ""}`,
  );
  if (status !== 200) notFound();
  const canComplete = can(viewer.actor, "remittance.execute");

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done")}
        </p>
      ) : null}
      <p className="mt-4 text-sm">
        {onlyToComplete ? (
          <Link className="underline" href="/fatturazione">
            {t("showAll")}
          </Link>
        ) : (
          <Link className="underline" href="/fatturazione?daCompletare=1">
            {t("showToComplete")}
          </Link>
        )}
      </p>
      {body.length === 0 ? (
        <Card className="mt-3">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="mt-3 space-y-3">
          {body.map((i) => (
            <li key={i.id}>
              <Card>
                <section aria-label={i.code}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {i.code} · {t(`recipientType.${i.recipientType}`)} · {i.recipient}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular font-semibold">{formatEuroCents(i.totalCents)}</span>
                      <Badge
                        tone={
                          i.toComplete || i.sdiStatus === "REJECTED"
                            ? "warning"
                            : i.sdiStatus === "DELIVERED"
                              ? "success"
                              : "neutral"
                        }
                      >
                        {i.toComplete ? t("toComplete") : t(`sdiStatus.${i.sdiStatus}`)}
                      </Badge>
                    </span>
                  </div>
                  <p className="text-sm text-warm-600">
                    {t("issuedOn", { date: formatDate(i.issuedOn) })}
                    {i.stampDutyCents > 0
                      ? ` · ${t("stampDuty", { amount: formatEuroCents(i.stampDutyCents) })}`
                      : ""}
                    {i.dueOn ? ` · ${t("dueOn", { date: formatDate(i.dueOn) })}` : ""}
                    {i.hasPdf ? (
                      <>
                        {" · "}
                        <a className="underline" href={`/fatturazione/${i.id}`}>
                          {t("pdf")}
                        </a>
                      </>
                    ) : null}
                  </p>
                  {canComplete &&
                  (i.toComplete || i.sdiStatus === "REJECTED" || i.sdiStatus === "TO_SEND") ? (
                    <form
                      action={completeRecipient}
                      className="mt-3 grid gap-2 text-sm sm:grid-cols-3"
                    >
                      <input type="hidden" name="invoiceId" value={i.id} />
                      <label className="grid gap-1">
                        {i.recipientType === "PRIVATE" ? t("fiscalCode") : t("vatNumber")}
                        <input
                          name={i.recipientType === "PRIVATE" ? "fiscalCode" : "vatNumber"}
                          required
                          className={field}
                        />
                      </label>
                      <label className="grid gap-1 sm:col-span-2">
                        {t("street")}
                        <input name="street" required minLength={3} className={field} />
                      </label>
                      <label className="grid gap-1">
                        {t("postalCode")}
                        <input name="postalCode" required pattern="\d{5}" className={field} />
                      </label>
                      <label className="grid gap-1">
                        {t("municipality")}
                        <input
                          name="municipalityIstat"
                          required
                          pattern="\d{6}"
                          className={field}
                        />
                      </label>
                      <label className="grid gap-1">
                        {t("province")}
                        <input name="province" required pattern="[A-Z]{2}" className={field} />
                      </label>
                      <Button type="submit" size="sm" className="justify-self-start">
                        {t("complete")}
                      </Button>
                    </form>
                  ) : null}
                </section>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

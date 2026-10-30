import { formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card } from "@astax/ui";
import { can } from "@astax/shared/permissions";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { approveRefund, rejectRefund, requestRefund } from "./actions";
import { RemittancesSection } from "./remittances-section";

interface RefundRow {
  id: string;
  code: string;
  reason: string;
  premiumCents: number;
  feeCents: number;
  status: "REQUESTED" | "APPROVED" | "EXECUTED" | "REJECTED" | "FAILED";
  requestedAt: string;
  executedAt: string | null;
}

/**
 * «Pagamenti» (spec 06), refunds: PAG-05, the supervisor approves each one;
 * the provider gives the money back on the same payment; then the weekly
 * remittances to the agencies (CONT-01, CONT-02).
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("payments");
  const query = await searchParams;
  const { status, body } = await api<RefundRow[]>("/back-office/refunds");
  const refunds = status === 200 ? body : null;
  if (status !== 200 && !can(viewer.actor, "accounting.view")) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Link href="/riconciliazione" className="mt-1 inline-block text-sm underline">
        {t("reconciliationLink")}
      </Link>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done")}
        </p>
      ) : null}
      <RemittancesSection canExecute={can(viewer.actor, "remittance.execute")} />
      {refunds ? <h2 className="mt-8 text-lg font-semibold">{t("refunds")}</h2> : null}
      {can(viewer.actor, "refund.request") ? (
        <Card className="mt-3">
          <h3 className="text-base font-semibold">{t("requestTitle")}</h3>
          <p className="mt-1 text-sm text-warm-600">{t("requestIntro")}</p>
          <form action={requestRefund} className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <label className="grid gap-1">
              {t("requestCode")}
              <input
                name="requestCode"
                required
                className="rounded-lg border border-warm-200 px-3 py-2"
              />
            </label>
            <label className="grid gap-1">
              {t("requestReason")}
              <select name="reason" className="rounded-lg border border-warm-200 px-3 py-2">
                <option value="INVALID_ACCEPTANCE">{t("reason.INVALID_ACCEPTANCE")}</option>
                <option value="BEFORE_ISSUANCE">{t("reason.BEFORE_ISSUANCE")}</option>
              </select>
            </label>
            <label className="grid gap-1">
              {t("requestPremium")}
              <input
                name="premium"
                inputMode="decimal"
                placeholder="0,00"
                className="rounded-lg border border-warm-200 px-3 py-2"
              />
            </label>
            <label className="grid gap-1">
              {t("requestFee")}
              <input
                name="fee"
                inputMode="decimal"
                placeholder="0,00"
                className="rounded-lg border border-warm-200 px-3 py-2"
              />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              {t("requestNote")}
              <input
                name="note"
                required
                minLength={3}
                className="rounded-lg border border-warm-200 px-3 py-2"
              />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" variant="outline">
                {t("requestSend")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      {!refunds ? null : refunds.length === 0 ? (
        <Card className="mt-3">
          <p className="text-sm">{t("noRefunds")}</p>
        </Card>
      ) : (
        <ul className="mt-3 space-y-3">
          {refunds.map((refund) => (
            <li key={refund.id}>
              <Card>
                <section aria-label={refund.code}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {refund.code} · {t(`reason.${refund.reason}`)}
                    </span>
                    <Badge tone={refund.status === "REQUESTED" ? "warning" : "neutral"}>
                      {t(`status.${refund.status}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm">
                    {t("amounts", {
                      premium: formatEuroCents(refund.premiumCents),
                      fee: formatEuroCents(refund.feeCents),
                      total: formatEuroCents(refund.premiumCents + refund.feeCents),
                    })}
                  </p>
                  <p className="text-sm text-warm-600">
                    {t("requestedAt", { at: formatDateTime(refund.requestedAt) })}
                    {refund.executedAt
                      ? ` · ${t("executedAt", { at: formatDateTime(refund.executedAt) })}`
                      : ""}
                  </p>
                  {refund.status === "REQUESTED" && can(viewer.actor, "refund.approve") ? (
                    <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
                      <form action={approveRefund}>
                        <input type="hidden" name="refundId" value={refund.id} />
                        <Button type="submit">{t("approve")}</Button>
                      </form>
                      <form action={rejectRefund} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="refundId" value={refund.id} />
                        <label className="grid gap-1">
                          {t("rejectReason")}
                          <input
                            name="reason"
                            required
                            minLength={3}
                            className="rounded-lg border border-warm-200 px-3 py-2"
                          />
                        </label>
                        <Button type="submit" variant="outline">
                          {t("reject")}
                        </Button>
                      </form>
                    </div>
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

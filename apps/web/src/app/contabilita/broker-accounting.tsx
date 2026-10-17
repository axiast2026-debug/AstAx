import { formatDate, formatEuroCents } from "@astax/shared/format";
import { Badge, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { api } from "@/lib/auth";

interface BrokerStatement {
  policies: {
    id: string;
    code: string;
    policyNumber: string;
    company: string;
    issuedAt: string;
    premiumCents: number;
    commission: {
      amountCents: number;
      status: "ACCRUED" | "SETTLED";
      settledAt: string | null;
    } | null;
    feeCents: number;
    invoiceCode: string | null;
  }[];
  invoices: {
    id: string;
    code: string;
    series: "P" | "A" | "B" | "N";
    issuedOn: string;
    dueOn: string | null;
    period: string | null;
    totalCents: number;
    sdiStatus: "TO_SEND" | "SENT" | "DELIVERED" | "REJECTED";
    hasPdf: boolean;
  }[];
}

/**
 * «Contabilità» of the broker (spec 02, CONT-05): the policies issued for
 * its customers with premium, commission (when active) and the fee due to
 * AstAx; the monthly invoices and credit notes; the CSV for its software.
 */
export async function BrokerAccounting() {
  const t = await getTranslations("brokerAccounting");
  const { status, body } = await api<BrokerStatement>("/broker/statement");
  if (status !== 200) notFound();
  const euro = (cents: number) => formatEuroCents(cents);
  const feeDue = body.policies.reduce((sum, p) => sum + p.feeCents, 0);
  return (
    <>
      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle>{t("statementTitle")}</CardTitle>
          <a className="text-sm underline" href="/contabilita/estratto-conto.csv">
            {t("exportCsv")}
          </a>
        </div>
        {body.policies.length === 0 ? (
          <p className="mt-2 text-sm">{t("noPolicies")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-warm-600">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("request")}</th>
                  <th className="py-1 pr-3 font-medium">{t("policy")}</th>
                  <th className="py-1 pr-3 font-medium">{t("issuedOn")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("premium")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("commission")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("fee")}</th>
                  <th className="py-1 font-medium">{t("invoice")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {body.policies.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1 pr-3">{p.code}</td>
                    <td className="py-1 pr-3">
                      {p.policyNumber} · {p.company}
                    </td>
                    <td className="py-1 pr-3">{formatDate(p.issuedAt)}</td>
                    <td className="tabular py-1 pr-3 text-right">{euro(p.premiumCents)}</td>
                    <td className="tabular py-1 pr-3 text-right">
                      {p.commission
                        ? `${euro(p.commission.amountCents)} · ${t(`commissionStatus.${p.commission.status}`)}`
                        : "—"}
                    </td>
                    <td className="tabular py-1 pr-3 text-right">{euro(p.feeCents)}</td>
                    <td className="py-1">{p.invoiceCode ?? t("nextInvoice")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm">{t("feeTotal", { amount: euro(feeDue) })}</p>
          </div>
        )}
      </Card>
      <Card className="mt-6">
        <CardTitle>{t("invoicesTitle")}</CardTitle>
        {body.invoices.length === 0 ? (
          <p className="mt-2 text-sm">{t("noInvoices")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {body.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  {i.series === "N" ? t("creditNote") : t("monthly")} {i.code} ·{" "}
                  {formatDate(i.issuedOn)} · <span className="tabular">{euro(i.totalCents)}</span>
                  {i.dueOn ? ` · ${t("dueOn", { date: formatDate(i.dueOn) })}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone={i.sdiStatus === "DELIVERED" ? "success" : "neutral"}>
                    {t(`sdiStatus.${i.sdiStatus}`)}
                  </Badge>
                  {i.hasPdf ? (
                    <a className="underline" href={`/fatture/${i.id}`}>
                      {t("download")}
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

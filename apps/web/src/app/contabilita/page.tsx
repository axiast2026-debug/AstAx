import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { can } from "@astax/shared/permissions";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { contestPenalty } from "./actions";
import { BrokerAccounting } from "./broker-accounting";

interface PenaltyRow {
  id: string;
  code: string | null;
  type: "LATE_ISSUANCE" | "MISSED_ISSUANCE" | "CIRCUMVENTION";
  amountCents: number;
  status: "APPLIED" | "CONTESTED" | "UPHELD" | "CANCELLED";
  appliedAt: string | null;
  contestUntil: string | null;
  contestText: string | null;
  decision: string | null;
}

type RemittanceStatus = "DRAFT" | "READY" | "FILE_GENERATED" | "EXECUTED";

interface Statement {
  policies: {
    id: string;
    code: string;
    policyNumber: string;
    issuedAt: string;
    premiumCents: number;
    feeCents: number | null;
    remittance: { runDate: string; status: RemittanceStatus } | null;
  }[];
  remittances: {
    id: string;
    runDate: string;
    policies: number;
    grossCents: number;
    feesCents: number;
    stampDutyCents: number;
    penaltiesCents: number;
    recoveriesCents: number;
    brokerSharesCents: number;
    netCents: number;
    carriedCents: number;
    status: RemittanceStatus;
    executedAt: string | null;
  }[];
  invoices: {
    id: string;
    code: string;
    issuedOn: string;
    totalCents: number;
    sdiStatus: "TO_SEND" | "SENT" | "DELIVERED" | "REJECTED";
    pdfDocumentId: string | null;
  }[];
}

/**
 * «Contabilità» of the agency (spec 04): the statement (each policy with
 * premium, fee and its remittance), the weekly remittances with what was
 * held back (CONT-01), AstAx's fee invoices (CONT-03) and the penalties,
 * with the contest within the time (EMI-05).
 */
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("accounting");
  if (viewer.activeMembership?.organization.type === "BROKER") {
    return (
      <AppShell viewer={viewer}>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <BrokerAccounting />
      </AppShell>
    );
  }
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const query = await searchParams;
  const [{ status, body: penalties }, statement] = await Promise.all([
    api<PenaltyRow[]>("/agency/penalties"),
    api<Statement>("/agency/statement"),
  ]);
  if (status === 403 || statement.status !== 200) notFound();
  const { policies, remittances, invoices } = statement.body;
  const euro = (cents: number) => formatEuroCents(cents);

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ErrorSummary codes={query.errore} />
      {query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("contested")}
        </p>
      ) : null}
      <Card className="mt-6">
        <CardTitle>{t("remittancesTitle")}</CardTitle>
        {remittances.length === 0 ? (
          <p className="mt-2 text-sm">{t("noRemittances")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {remittances.map((r) => (
              <li key={r.id} className="py-3">
                <section aria-label={t("remittanceOf", { date: formatDate(r.runDate) })}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {t("remittanceOf", { date: formatDate(r.runDate) })} ·{" "}
                      {t("policiesCount", { count: r.policies })}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular font-semibold">{euro(r.netCents)}</span>
                      <Badge tone={r.status === "EXECUTED" ? "success" : "neutral"}>
                        {t(`remittanceStatus.${r.status}`)}
                      </Badge>
                    </span>
                  </div>
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 text-warm-600 sm:grid-cols-3">
                    <div>
                      <dt className="inline">{t("gross")}: </dt>
                      <dd className="tabular inline">{euro(r.grossCents)}</dd>
                    </div>
                    <div>
                      <dt className="inline">{t("fees")}: </dt>
                      <dd className="tabular inline">−{euro(r.feesCents)}</dd>
                    </div>
                    {(
                      [
                        ["stampDuty", r.stampDutyCents],
                        ["penalties", r.penaltiesCents],
                        ["recoveries", r.recoveriesCents],
                        ["brokerShares", r.brokerSharesCents],
                      ] as const
                    )
                      .filter(([, cents]) => cents > 0)
                      .map(([key, cents]) => (
                        <div key={key}>
                          <dt className="inline">{t(key)}: </dt>
                          <dd className="tabular inline">−{euro(cents)}</dd>
                        </div>
                      ))}
                  </dl>
                  {r.carriedCents > 0 ? (
                    <p className="mt-1">{t("carried", { amount: euro(r.carriedCents) })}</p>
                  ) : null}
                  {r.executedAt ? (
                    <p className="text-warm-600">
                      {t("executedAt", { at: formatDateTime(r.executedAt) })}
                    </p>
                  ) : null}
                </section>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-6">
        <CardTitle>{t("statementTitle")}</CardTitle>
        {policies.length === 0 ? (
          <p className="mt-2 text-sm">{t("noPolicies")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-warm-600">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("request")}</th>
                  <th className="py-1 pr-3 font-medium">{t("policyNumber")}</th>
                  <th className="py-1 pr-3 font-medium">{t("issuedOn")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("premium")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("fee")}</th>
                  <th className="py-1 font-medium">{t("remittance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1 pr-3">{p.code}</td>
                    <td className="py-1 pr-3">{p.policyNumber}</td>
                    <td className="py-1 pr-3">{formatDate(p.issuedAt)}</td>
                    <td className="tabular py-1 pr-3 text-right">{euro(p.premiumCents)}</td>
                    <td className="tabular py-1 pr-3 text-right">
                      {p.feeCents === null ? "—" : euro(p.feeCents)}
                    </td>
                    <td className="py-1">
                      {p.remittance
                        ? `${formatDate(p.remittance.runDate)} · ${t(`remittanceStatus.${p.remittance.status}`)}`
                        : t("nextRemittance")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="mt-6">
        <CardTitle>{t("invoicesTitle")}</CardTitle>
        {invoices.length === 0 ? (
          <p className="mt-2 text-sm">{t("noInvoices")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  {i.code} · {formatDate(i.issuedOn)} ·{" "}
                  <span className="tabular">{euro(i.totalCents)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone={i.sdiStatus === "DELIVERED" ? "success" : "neutral"}>
                    {t(`sdiStatus.${i.sdiStatus}`)}
                  </Badge>
                  {i.pdfDocumentId ? (
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
      <Card className="mt-6">
        <CardTitle>{t("penaltiesTitle")}</CardTitle>
        {penalties.length === 0 ? (
          <p className="mt-2 text-sm">{t("noPenalties")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {penalties.map((p) => {
              const open = p.status === "APPLIED" && p.contestUntil !== null;
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {t(`type.${p.type}`)}
                      {p.code ? ` · ${p.code}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular font-semibold">
                        {formatEuroCents(p.amountCents)}
                      </span>
                      <Badge tone={p.status === "CANCELLED" ? "neutral" : "warning"}>
                        {t(`status.${p.status}`)}
                      </Badge>
                    </span>
                  </div>
                  {p.appliedAt ? (
                    <p className="text-warm-600">
                      {t("appliedAt", { at: formatDateTime(p.appliedAt) })}
                    </p>
                  ) : null}
                  {p.decision ? (
                    <p className="mt-1">{t("decision", { text: p.decision })}</p>
                  ) : null}
                  {open && p.contestUntil ? (
                    <form action={contestPenalty} className="mt-2 grid gap-2">
                      <input type="hidden" name="penaltyId" value={p.id} />
                      <label className="grid gap-1">
                        {t("contestLabel", { until: formatDateTime(p.contestUntil) })}
                        <textarea
                          name="text"
                          required
                          minLength={3}
                          maxLength={1000}
                          rows={2}
                          className="rounded-lg border border-warm-200 px-3 py-2"
                        />
                      </label>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="justify-self-start"
                      >
                        {t("contest")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {can(viewer.actor, "accounting.brokerStatement") ? (
        // ADR 0015: the fees of the quotes the agency requested for its customers.
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t("requesterTitle")}</h2>
          <BrokerAccounting optional />
        </section>
      ) : null}
    </AppShell>
  );
}

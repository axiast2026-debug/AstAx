import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { api } from "@/lib/auth";
import {
  executeRemittance,
  generateSepaFile,
  prepareRemittances,
  reviewRemittance,
} from "./actions";

interface RemittanceRow {
  id: string;
  agency: string;
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
  status: "DRAFT" | "READY" | "FILE_GENERATED" | "EXECUTED";
  executedAt: string | null;
}

/**
 * «Pagamenti» (spec 06), the weekly remittances (CONT-01, CONT-02): prepared
 * on Monday (or with the button), reviewed one by one (the agency's invoice is
 * issued), one SEPA file per run day for the bank, then marked as executed.
 */
export async function RemittancesSection({ canExecute }: { canExecute: boolean }) {
  const t = await getTranslations("remittances");
  const { status, body } = await api<RemittanceRow[]>("/back-office/remittances");
  if (status !== 200) return null;
  const runDates = [...new Set(body.map((r) => r.runDate))];
  const euro = (cents: number) => formatEuroCents(cents);

  return (
    <section id="rimesse" aria-labelledby="rimesse-title" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="rimesse-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        {canExecute ? (
          <form action={prepareRemittances}>
            <Button type="submit" size="sm" variant="outline">
              {t("prepare")}
            </Button>
          </form>
        ) : null}
      </div>
      {runDates.length === 0 ? (
        <Card className="mt-3">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : null}
      {runDates.map((runDate) => {
        const rows = body.filter((r) => r.runDate === runDate);
        const ready = rows.some((r) => r.status === "READY" && r.netCents > 0);
        return (
          <Card key={runDate} className="mt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="font-semibold">{t("runDate", { date: formatDate(runDate) })}</h3>
              {canExecute && ready ? (
                <form action={generateSepaFile}>
                  <input type="hidden" name="runDate" value={runDate} />
                  <Button type="submit" size="sm">
                    {t("generateFile")}
                  </Button>
                </form>
              ) : null}
            </div>
            <ul className="mt-2 divide-y divide-warm-200 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="py-3">
                  <section aria-label={`${r.agency} ${formatDate(runDate)}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {r.agency} · {t("policies", { count: r.policies })}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular font-semibold">{euro(r.netCents)}</span>
                        <Badge tone={r.status === "EXECUTED" ? "success" : "neutral"}>
                          {t(`status.${r.status}`)}
                        </Badge>
                      </span>
                    </div>
                    <p className="tabular text-warm-600">
                      {t("breakdown", {
                        gross: euro(r.grossCents),
                        fees: euro(r.feesCents),
                        held: euro(
                          r.stampDutyCents +
                            r.penaltiesCents +
                            r.recoveriesCents +
                            r.brokerSharesCents,
                        ),
                      })}
                      {r.carriedCents > 0
                        ? ` · ${t("carried", { amount: euro(r.carriedCents) })}`
                        : ""}
                    </p>
                    {r.executedAt ? (
                      <p className="text-warm-600">
                        {t("executedAt", { at: formatDateTime(r.executedAt) })}
                      </p>
                    ) : null}
                    {canExecute ? (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {r.status === "DRAFT" ? (
                          <form action={reviewRemittance}>
                            <input type="hidden" name="remittanceId" value={r.id} />
                            <Button type="submit" size="sm">
                              {t("review")}
                            </Button>
                          </form>
                        ) : null}
                        {r.status === "FILE_GENERATED" ? (
                          <a className="underline" href={`/pagamenti/rimesse/${r.id}`}>
                            {t("downloadFile")}
                          </a>
                        ) : null}
                        {r.status === "FILE_GENERATED" ||
                        (r.status === "READY" && r.netCents === 0) ? (
                          <form action={executeRemittance}>
                            <input type="hidden" name="remittanceId" value={r.id} />
                            <Button type="submit" size="sm" variant="outline">
                              {t("execute")}
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </section>
  );
}

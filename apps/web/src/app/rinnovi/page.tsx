import { addCalendarDays, weekdayOf } from "@astax/shared/domain";
import { formatDate, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { renewMonth, renewPolicy, setAutoRenewal } from "../renewal-actions";

interface RenewalRow {
  id: string;
  policyNumber: string;
  client: string;
  vehicle: string;
  company: string;
  endDate: string;
  premiumCents: number;
  autoRenewal: boolean;
  renewable: boolean;
  renewal: { id: string; code: string; status: string } | null;
}

const WEEKDAY_INDEX = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 } as const;

/** The Monday of the week of a calendar date. */
function mondayOf(date: string): string {
  return addCalendarDays(date, -WEEKDAY_INDEX[weekdayOf(date)]);
}

/**
 * «Rinnovi» of the broker (spec 02, process 10): the ends of the next days by
 * week, the automatic renewal per customer, the renewal of one policy or of
 * all those of a month (proposal E: drafts, the auction after the new risk
 * certificate).
 */
export default async function RenewalsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; preparati?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "BROKER") notFound();
  const t = await getTranslations("renewals");
  const query = await searchParams;
  const { status, body } = await api<{
    horizonDays: number;
    noticeDays: number;
    policies: RenewalRow[];
  }>("/broker/renewals");
  if (status !== 200) notFound();
  const weeks = [...new Set(body.policies.map((p) => mondayOf(p.endDate)))];

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-warm-600">{t("intro", { days: body.horizonDays })}</p>
      <ErrorSummary codes={query.errore} />
      {query.preparati !== undefined ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("prepared", { count: Number(query.preparati) || 0 })}
        </p>
      ) : null}
      <Card className="mt-6">
        <h2 className="font-semibold">{t("bulkTitle")}</h2>
        <form action={renewMonth} className="mt-2 flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">
            {t("bulkMonth")}
            <input
              type="month"
              name="period"
              required
              className="rounded-lg border border-warm-200 px-3 py-2"
            />
          </label>
          <Button type="submit" size="sm" variant="outline">
            {t("bulk")}
          </Button>
        </form>
      </Card>
      {weeks.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : null}
      {weeks.map((week) => (
        <section key={week} className="mt-6" aria-label={t("week", { date: formatDate(week) })}>
          <h2 className="text-lg font-semibold">{t("week", { date: formatDate(week) })}</h2>
          <ul className="mt-2 space-y-3">
            {body.policies
              .filter((p) => mondayOf(p.endDate) === week)
              .map((p) => (
                <li key={p.id}>
                  <Card>
                    <section aria-label={`${p.client} ${p.policyNumber}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">
                          {p.client} · {p.vehicle}
                        </span>
                        <span className="text-sm">
                          {p.company} · {p.policyNumber} ·{" "}
                          {t("endsOn", { date: formatDate(p.endDate) })} ·{" "}
                          <span className="tabular">{formatEuroCents(p.premiumCents)}</span>
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <span>{t("auto")}:</span>
                        <Badge tone={p.autoRenewal ? "success" : "neutral"}>
                          {p.autoRenewal ? t("autoOn") : t("autoOff")}
                        </Badge>
                        <form action={setAutoRenewal}>
                          <input type="hidden" name="policyId" value={p.id} />
                          <input type="hidden" name="enabled" value={String(!p.autoRenewal)} />
                          <Button type="submit" size="sm" variant="outline">
                            {p.autoRenewal ? t("turnOff") : t("turnOn")}
                          </Button>
                        </form>
                        {p.renewal ? (
                          <a className="underline" href={`/richieste/${p.renewal.id}`}>
                            {t("open", { code: p.renewal.code })}
                          </a>
                        ) : p.renewable ? (
                          <form action={renewPolicy}>
                            <input type="hidden" name="policyId" value={p.id} />
                            <input type="hidden" name="base" value="/richieste" />
                            <input type="hidden" name="back" value="/rinnovi" />
                            <Button type="submit" size="sm">
                              {t("prepare")}
                            </Button>
                          </form>
                        ) : (
                          <span className="text-warm-600">
                            {t("notYet", { days: body.noticeDays })}
                          </span>
                        )}
                      </div>
                    </section>
                  </Card>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </AppShell>
  );
}

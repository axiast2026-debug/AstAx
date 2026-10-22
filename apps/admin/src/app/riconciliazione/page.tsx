import { formatDate, formatEuroCents } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { importStatement, lineStep } from "./actions";

interface Line {
  id: string;
  bookingDate: string;
  amountCents: number;
  counterparty: string | null;
  description: string;
  reference: string | null;
  status: "UNMATCHED" | "MATCHED" | "IGNORED";
  matchedBy: string | null;
  note: string | null;
  requestCode: string | null;
  candidates: { id: string; requestCode: string }[];
}

interface Day {
  day: string;
  creditsCents: number;
  matchedCents: number;
  capturedCents: number;
  differenceCents: number;
}

const STATUSES = ["UNMATCHED", "MATCHED", "IGNORED"] as const;
const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * «Riconciliazione» (spec 06 «Pagamenti», proposal C): the statement of the
 * separate account imported, the lines without a match to decide by hand
 * (with a note), the daily balance between credits and captured payments.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{
    stato?: string;
    errore?: string;
    fatto?: string;
    abbinate?: string;
    coda?: string;
    da?: string;
    a?: string;
  }>;
}) {
  const viewer = await requireViewer();
  if (!can(viewer.actor, "accounting.view")) notFound();
  const t = await getTranslations("reconciliation");
  const query = await searchParams;
  const status = STATUSES.find((s) => s === query.stato) ?? "UNMATCHED";
  const manage = can(viewer.actor, "payment.reconcile");
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const lines = await api<Line[]>(`/back-office/reconciliation/lines?status=${status}`);
  const balance =
    query.da && query.a && DAY.test(query.da) && DAY.test(query.a)
      ? await api<Day[]>(`/back-office/reconciliation/daily?from=${query.da}&to=${query.a}`)
      : null;
  if (lines.status !== 200) notFound();
  const money = (cents: number) => formatEuroCents(cents);

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.abbinate ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("imported", { matched: Number(query.abbinate) || 0, queued: Number(query.coda) || 0 })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done")}
        </p>
      ) : null}

      {manage ? (
        <Card className="mt-6">
          <CardTitle>{t("import")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">{t("importHint")}</p>
          <form action={importStatement} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <input type="file" name="file" required accept=".csv,.xml,text/csv,application/xml" />
            <Button type="submit" size="sm">
              {t("importButton")}
            </Button>
          </form>
        </Card>
      ) : null}

      <nav aria-label={t("filter")} className="mt-6 flex flex-wrap gap-4 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/riconciliazione?stato=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={s === status ? "font-semibold underline" : "underline"}
          >
            {t(`status.${s}`)}
          </Link>
        ))}
      </nav>
      <div className="mt-3 space-y-3">
        {lines.body.length === 0 ? <p className="text-sm text-warm-600">{t("empty")}</p> : null}
        {lines.body.map((l) => (
          <Card key={l.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">
                {formatDate(l.bookingDate)} · {money(l.amountCents)}
              </span>
              <span className="text-warm-600">{l.reference ?? ""}</span>
            </div>
            <p className="text-sm">
              {l.counterparty ? `${l.counterparty} · ` : ""}
              {l.description}
            </p>
            {l.requestCode ? (
              <p className="text-sm text-warm-600">
                {t("matchedTo", { code: l.requestCode })}
                {l.matchedBy ? ` · ${t(`matchedBy.${l.matchedBy}`)}` : ""}
              </p>
            ) : null}
            {l.note ? <p className="text-sm text-warm-600">{l.note}</p> : null}
            {manage && l.status === "UNMATCHED" ? (
              <form
                action={lineStep}
                className="mt-3 grid gap-2 text-sm md:grid-cols-[1fr_1fr_auto]"
              >
                <input type="hidden" name="id" value={l.id} />
                <label className="grid gap-1">
                  {t("action")}
                  <select name="step" className={field}>
                    {l.candidates.length > 0 ? <option value="match">{t("match")}</option> : null}
                    <option value="ignore">{t("ignore")}</option>
                  </select>
                </label>
                {l.candidates.length > 0 ? (
                  <label className="grid gap-1">
                    {t("payment")}
                    <select name="paymentId" className={field}>
                      {l.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.requestCode}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="self-end text-xs text-warm-600">{t("noCandidates")}</p>
                )}
                <label className="grid gap-1 md:col-span-2">
                  {t("note")}
                  <input name="note" required minLength={3} className={field} />
                </label>
                <Button type="submit" size="sm" className="self-end">
                  {t("confirm")}
                </Button>
              </form>
            ) : null}
            {manage && l.status !== "UNMATCHED" ? (
              <form action={lineStep} className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="step" value="reopen" />
                <label className="grid gap-1">
                  {t("note")}
                  <input name="note" required minLength={3} className={field} />
                </label>
                <Button type="submit" size="sm" variant="outline">
                  {t("reopen")}
                </Button>
              </form>
            ) : null}
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <CardTitle>{t("daily")}</CardTitle>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="stato" value={status} />
          <label className="grid gap-1">
            {t("from")}
            <input type="date" name="da" required defaultValue={query.da} className={field} />
          </label>
          <label className="grid gap-1">
            {t("to")}
            <input type="date" name="a" required defaultValue={query.a} className={field} />
          </label>
          <Button type="submit" size="sm" variant="outline">
            {t("show")}
          </Button>
        </form>
        {balance?.status === 200 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-warm-600">
                <tr>
                  <th className="py-2 pr-3">{t("day")}</th>
                  <th className="py-2 pr-3">{t("credits")}</th>
                  <th className="py-2 pr-3">{t("matched")}</th>
                  <th className="py-2 pr-3">{t("captured")}</th>
                  <th className="py-2">{t("difference")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {balance.body.map((d) => (
                  <tr key={d.day}>
                    <td className="py-2 pr-3">{formatDate(d.day)}</td>
                    <td className="py-2 pr-3">{money(d.creditsCents)}</td>
                    <td className="py-2 pr-3">{money(d.matchedCents)}</td>
                    <td className="py-2 pr-3">{money(d.capturedCents)}</td>
                    <td
                      className={
                        d.differenceCents === 0 ? "py-2" : "py-2 font-semibold text-red-700"
                      }
                    >
                      {money(d.differenceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}

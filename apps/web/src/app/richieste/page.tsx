import { formatDate } from "@astax/shared/format";
import { Button, buttonVariants } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field, SelectField } from "@/components/form";
import { StatusBadge } from "@/components/request-view";
import { search } from "@/app/request-actions";
import { api } from "@/lib/auth";
import { brokerTask, START_WITHIN_DAYS, taskHref, TODO_STATUSES } from "@/lib/broker-work";
import { readSearch } from "@/lib/search";
import { requireViewer } from "@/lib/me";
import type { RequestSummary } from "@/lib/requests";

const STATUSES = [
  "DRAFT",
  "IN_VERIFICATION",
  "INTEGRATION_REQUESTED",
  "EXCLUDED",
  "AUCTION_OPEN",
  "OFFERS_AVAILABLE",
  "DESERTED",
  "ACCEPTED",
  "IN_ISSUANCE",
  "ISSUED",
  "EXPIRED",
  "IN_RECONFIRMATION",
  "CANCELLED",
];
const TODO = "DA_FARE";

/**
 * The broker's work area (docs/piano-broker.md, G, Dan 2026-10-21): one
 * table of every request, with filters and what to do now on each row.
 * Built for the computer; on a phone the table scrolls sideways.
 */
export default async function BrokerRequestsPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("brokerRequests");
  const ts = await getTranslations("requestStatus");
  const saved = await readSearch("richieste");
  const query = {
    stato: saved.status ?? "",
    targa: saved.q ?? "",
    cliente: saved.customer ?? "",
    giorni: saved.days ?? "",
  };
  const days = Number(query.giorni);
  const filter = {
    ...(query.stato === TODO ? { statuses: TODO_STATUSES } : {}),
    ...(STATUSES.includes(query.stato) ? { status: query.stato } : {}),
    ...(query.targa ? { q: query.targa } : {}),
    ...(query.cliente ? { customer: query.cliente } : {}),
    ...((START_WITHIN_DAYS as readonly number[]).includes(days) ? { startWithinDays: days } : {}),
  };
  const [{ body: requests }, { body: todo }] = await Promise.all([
    api<RequestSummary[]>("/requests/search", { method: "POST", body: JSON.stringify(filter) }),
    api<RequestSummary[]>("/requests/search", {
      method: "POST",
      body: JSON.stringify({ statuses: TODO_STATUSES }),
    }),
  ]);
  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-warm-600">{t("todoCount", { count: todo.length })}</p>
        </div>
        <Link href="/richieste/nuova" className={buttonVariants()}>
          {t("new")}
        </Link>
      </div>
      <form
        action={search}
        className="mt-6 grid gap-4 rounded-xl border border-warm-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
      >
        <input type="hidden" name="scope" value="richieste" />
        <SelectField
          label={t("status")}
          name="stato"
          placeholder={t("allStatuses")}
          options={[
            { code: TODO, label: t("todoFilter") },
            ...STATUSES.map((code) => ({ code, label: ts(code) })),
          ]}
          defaultValue={query.stato}
        />
        <Field label={t("customer")} name="cliente" defaultValue={query.cliente} />
        <Field label={t("plate")} name="q" defaultValue={query.targa} />
        <SelectField
          label={t("startWithin")}
          name="giorni"
          placeholder={t("anyStart")}
          options={START_WITHIN_DAYS.map((d) => ({
            code: String(d),
            label: t("withinDays", { days: d }),
          }))}
          defaultValue={query.giorni}
        />
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="text-left text-warm-600">
              <th scope="col" className="py-2">
                {t("code")}
              </th>
              <th scope="col">{t("customer")}</th>
              <th scope="col">{t("plate")}</th>
              <th scope="col">{t("start")}</th>
              <th scope="col">{t("status")}</th>
              <th scope="col">{t("todo")}</th>
              <th scope="col">{t("created")}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const task = brokerTask(r.status);
              return (
                <tr key={r.id} className="border-t border-warm-200 align-middle">
                  <td className="py-2">
                    <Link href={`/richieste/${r.id}`} className="underline">
                      {r.code}
                    </Link>
                  </td>
                  <td>{r.customer}</td>
                  <td>{r.plate}</td>
                  <td className="tabular">{r.startDate ? formatDate(r.startDate) : "—"}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2">
                    {task.kind === "ACTION" ? (
                      <Link
                        href={taskHref(r.id, task)}
                        className={buttonVariants({ size: "sm" })}
                        aria-label={`${t(`tasks.${task.key}`)} ${r.code}`}
                      >
                        {t(`tasks.${task.key}`)}
                      </Link>
                    ) : task.kind === "WAIT" ? (
                      <span className="text-warm-600">{t(`waits.${task.key}`)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="tabular">{formatDate(r.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {requests.length === 0 ? <p className="mt-4 text-sm">{t("empty")}</p> : null}
    </AppShell>
  );
}

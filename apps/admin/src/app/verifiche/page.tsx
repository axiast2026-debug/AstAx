import { formatDateTime, formatTime } from "@astax/shared/format";
import { Badge, Button, buttonVariants, Card, cn } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import type { QueueRow } from "@/lib/verification";
import { assignToMe } from "./actions";

const TONE = { GREEN: "success", YELLOW: "warning", RED: "danger" } as const;
const FILTERS = ["tutte", "da-prendere", "mie"] as const;
type Filter = (typeof FILTERS)[number];
/** How often the list reads itself again (a screen setting, not a business number). */
const REFRESH_SECONDS = 15;

/**
 * Verification queue (spec 06 «Coda verifiche»; Dan, 2026-10-28): oldest
 * first, with who holds each request and how many of the five checks are done.
 */
export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("verification");
  const query = await searchParams;
  const filter: Filter = FILTERS.includes(query.filtro as Filter)
    ? (query.filtro as Filter)
    : "tutte";
  const { status, body: all } = await api<QueueRow[]>("/verification/queue");
  if (status === 403) notFound();
  const free = all.filter((r) => r.assignedTo === null);
  const mine = all.filter((r) => r.assignedTo?.id === viewer.me.id);
  const rows = filter === "da-prendere" ? free : filter === "mie" ? mine : all;
  const counts: Record<Filter, number> = {
    tutte: all.length,
    "da-prendere": free.length,
    mie: mine.length,
  };

  return (
    <AppShell viewer={viewer}>
      <AutoRefresh seconds={REFRESH_SECONDS} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-screen font-extrabold">{t("queueTitle")}</h1>
        <Link href="/portale-ania" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("queue.portal")}
        </Link>
      </div>
      {query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(
            `done.${query.fatto === "approvata" || query.fatto === "integrazione" || query.fatto === "esclusa" ? query.fatto : "approvata"}`,
          )}
        </p>
      ) : null}
      <nav aria-label={t("queue.filters")} className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "tutte" ? "/verifiche" : `/verifiche?filtro=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold",
              f === filter
                ? "border-2 border-night-900 bg-night-900 text-white"
                : "border border-night-100 bg-white text-night-800",
            )}
          >
            {t(`queue.filter.${f}`, { count: counts[f] })}
          </Link>
        ))}
      </nav>
      <Card className="mt-4 overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm">{t("emptyQueue")}</p>
        ) : (
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">{t("queueTitle")}</caption>
            <thead className="bg-warm-100 text-warm-800">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {t("code")}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {t("requester")}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {t("waiting")}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {t("outcome")}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {t("queue.checks")}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {t("assignedTo")}
                </th>
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">{t("queue.action")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200">
              {rows.map((r) => {
                const isMine = r.assignedTo?.id === viewer.me.id;
                const since = r.assignedTo?.since ? formatTime(r.assignedTo.since) : "—";
                return (
                  <tr key={r.requestId} className={isMine ? "bg-night-50" : undefined}>
                    <td className="px-4 py-3">
                      <Link href={`/verifiche/${r.requestId}`} className="font-semibold underline">
                        {r.code}
                      </Link>
                      {r.round > 1 ? (
                        <span className="ml-2 text-xs text-warm-600">
                          {t("round", { round: r.round })}
                        </span>
                      ) : null}
                      <br />
                      <span className="text-warm-600">
                        {[r.plate, r.quoteType ? t(`checks.quoteTypes.${r.quoteType}`) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className="px-3 py-3">{t(`channels.${r.channel}`)}</td>
                    <td className="px-3 py-3 tabular">
                      <time dateTime={r.waitingSince} title={formatDateTime(r.waitingSince)}>
                        {t("minutes", { minutes: r.waitingMinutes })}
                      </time>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={TONE[r.autoOutcome]}>{t(`outcomes.${r.autoOutcome}`)}</Badge>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 tabular",
                        r.checksDone === 5 ? "font-semibold text-green-700" : "",
                      )}
                    >
                      {t("queue.checksDone", { done: r.checksDone })}
                    </td>
                    <td className="px-3 py-3">
                      {r.assignedTo === null ? (
                        <span className="font-semibold text-warning-700">{t("unassigned")}</span>
                      ) : isMine ? (
                        t.rich("queue.heldByMe", {
                          name: r.assignedTo.name,
                          time: since,
                          strong: (chunks) => <strong>{chunks}</strong>,
                        })
                      ) : (
                        t("queue.heldBy", { name: r.assignedTo.name, time: since })
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.assignedTo === null ? (
                        <form action={assignToMe}>
                          <input type="hidden" name="requestId" value={r.requestId} />
                          <Button type="submit" size="sm">
                            {t("assignToMe")}
                          </Button>
                        </form>
                      ) : (
                        <Link
                          href={`/verifiche/${r.requestId}`}
                          className={buttonVariants({
                            variant: isMine ? "secondary" : "outline",
                            size: "sm",
                          })}
                        >
                          {isMine ? t("queue.continue") : t("queue.look")}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <p className="mt-3 text-xs text-warm-600">{t("queue.note")}</p>
    </AppShell>
  );
}

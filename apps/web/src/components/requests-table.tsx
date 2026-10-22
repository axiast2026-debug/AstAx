import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { buttonVariants, cn } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ClosesIn } from "@/components/countdown-ring";
import { StatusBadge } from "@/components/request-view";
import { brokerTask, taskHref } from "@/lib/broker-work";
import type { RequestSummary } from "@/lib/requests";

/**
 * The broker's work table (docs/piano-broker.md, G; Broker of the design):
 * every request with what to do now. During the auction the time ring and
 * the counters only (VIS-03: offers and invited agencies, never a price or
 * a name); after the closing the lowest premium and its guarantee. A draft
 * of a lot also says the day it leaves by itself (ADR 0014).
 */
export async function RequestsTable({
  requests,
  caption,
}: {
  requests: RequestSummary[];
  caption: string;
}) {
  const t = await getTranslations("brokerRequests");
  const COLUMNS = ["customer", "status", "closing", "offers", "best", "operator", "todo"] as const;
  return (
    <>
      <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
        <table className="w-full min-w-[60rem] text-left text-table">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-warm-100 text-note text-warm-800">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-semibold first:pl-4">
                  {t(`columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const task = brokerTask(r.status);
              const a = r.auction;
              return (
                <tr key={r.id} className="border-t border-warm-200 align-middle hover:bg-warm-50">
                  <td className="py-2 pr-3 pl-4">
                    <span className="block font-semibold">{r.customer ?? "—"}</span>
                    <span className="block text-note whitespace-nowrap text-warm-600 tabular">
                      {r.plate ? `${r.plate} · ` : ""}
                      <Link href={`/richieste/${r.id}`} className="underline underline-offset-2">
                        {r.code}
                      </Link>
                    </span>
                    {r.batch ? (
                      <span className="block text-note text-warm-600">{r.batch}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">
                    {a?.live ? (
                      <ClosesIn time={a.live} size={24} />
                    ) : a?.bestGuaranteeUntil ? (
                      t("guaranteedUntil", { date: formatDate(a.bestGuaranteeUntil) })
                    ) : a ? (
                      t("closedOn", { date: formatDateTime(a.scheduledCloseAt) })
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 tabular">
                    {a
                      ? a.invited === undefined
                        ? a.offers
                        : t("offersInvited", { offers: a.offers, invited: a.invited })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 font-semibold tabular">
                    {a?.bestPremiumCents != null ? formatEuroCents(a.bestPremiumCents) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.operator ?? "—"}</td>
                  <td className="px-3 py-2">
                    {task.kind === "ACTION" ? (
                      <Link
                        href={taskHref(r.id, task)}
                        className={cn(
                          buttonVariants({ variant: "secondary", size: "sm" }),
                          "whitespace-nowrap",
                        )}
                        aria-label={`${t(`tasks.${task.key}`)} ${r.code}`}
                      >
                        {t(`tasks.${task.key}`)}
                      </Link>
                    ) : task.kind === "WAIT" ? (
                      <span className="text-warm-600">{t(`waits.${task.key}`)}</span>
                    ) : (
                      "—"
                    )}
                    {r.scheduledSubmitAt ? (
                      <span className="mt-1 block text-note text-warm-600">
                        {t("leavesOn", { date: formatDate(r.scheduledSubmitAt) })}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {requests.length === 0 ? <p className="mt-4 text-table">{t("empty")}</p> : null}
      <p className="mt-3 text-note text-warm-600">{t("sealedNote")}</p>
    </>
  );
}

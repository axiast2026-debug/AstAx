import { formatDate } from "@astax/shared/format";
import { buttonVariants } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatusBadge } from "@/components/request-view";
import { brokerTask, taskHref } from "@/lib/broker-work";
import type { RequestSummary } from "@/lib/requests";

/**
 * The broker's work table (docs/piano-broker.md, G): every request with what
 * to do now. A draft of a lot also says the day it leaves by itself (ADR 0014).
 */
export async function RequestsTable({
  requests,
  caption,
}: {
  requests: RequestSummary[];
  caption: string;
}) {
  const t = await getTranslations("brokerRequests");
  return (
    <>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">{caption}</caption>
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
                    {r.batch ? (
                      <span className="block text-xs text-warm-600">{r.batch}</span>
                    ) : null}
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
                    {r.scheduledSubmitAt ? (
                      <span className="mt-1 block text-xs text-warm-600">
                        {t("leavesOn", { date: formatDate(r.scheduledSubmitAt) })}
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular">{formatDate(r.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {requests.length === 0 ? <p className="mt-4 text-sm">{t("empty")}</p> : null}
    </>
  );
}

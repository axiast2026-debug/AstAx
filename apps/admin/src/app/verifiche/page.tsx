import { formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import type { QueueRow } from "@/lib/verification";

const TONE = { GREEN: "success", YELLOW: "warning", RED: "danger" } as const;

/** Verification queue (spec 06 «Coda verifiche»): oldest first, with the automatic outcome. */
export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ esito?: string; mie?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("verification");
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.esito && ["GREEN", "YELLOW", "RED"].includes(query.esito))
    params.set("outcome", query.esito);
  if (query.mie === "1") params.set("mine", "true");
  const { status, body: rows } = await api<QueueRow[]>(`/verification/queue?${params.toString()}`);
  if (status === 403) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("queueTitle")}</h1>
      {query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(
            `done.${query.fatto === "approvata" || query.fatto === "integrazione" || query.fatto === "esclusa" ? query.fatto : "approvata"}`,
          )}
        </p>
      ) : null}
      <form className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="esito" className="block text-sm font-medium">
            {t("outcome")}
          </label>
          <select
            id="esito"
            name="esito"
            defaultValue={query.esito ?? ""}
            className="mt-1 rounded-lg border border-warm-200 px-3 py-2"
          >
            <option value="">{t("allOutcomes")}</option>
            {(["GREEN", "YELLOW", "RED"] as const).map((o) => (
              <option key={o} value={o}>
                {t(`outcomes.${o}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input
            id="mie"
            name="mie"
            type="checkbox"
            value="1"
            defaultChecked={query.mie === "1"}
            className="h-4 w-4"
          />
          <label htmlFor="mie" className="text-sm">
            {t("mine")}
          </label>
        </div>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>
      <Card className="mt-6 overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm">{t("emptyQueue")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("queueTitle")}</caption>
            <thead className="bg-warm-100 text-warm-800">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("code")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("requester")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("waiting")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("outcome")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("assignedTo")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200">
              {rows.map((r) => (
                <tr key={r.requestId}>
                  <td className="px-4 py-2">
                    <Link href={`/verifiche/${r.requestId}`} className="font-medium underline">
                      {r.code}
                    </Link>
                    {r.round > 1 ? (
                      <span className="ml-2 text-xs text-warm-600">
                        {t("round", { round: r.round })}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{t(`channels.${r.channel}`)}</td>
                  <td className="px-4 py-2 tabular">
                    <time dateTime={r.waitingSince} title={formatDateTime(r.waitingSince)}>
                      {t("minutes", { minutes: r.waitingMinutes })}
                    </time>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={TONE[r.autoOutcome]}>{t(`outcomes.${r.autoOutcome}`)}</Badge>
                  </td>
                  <td className="px-4 py-2">{r.assignedTo?.name ?? t("unassigned")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}

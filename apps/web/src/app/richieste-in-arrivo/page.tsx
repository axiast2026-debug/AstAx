import { formatDate, formatDateTime } from "@astax/shared/format";
import { Badge, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Countdown } from "@/components/countdown";
import { api } from "@/lib/auth";
import type { IncomingRow, IncomingState } from "@/lib/agency";
import { requireViewer } from "@/lib/me";

const TONE: Record<IncomingState, "success" | "warning" | "neutral" | "dark"> = {
  NEW: "success",
  CLAIMED_BY_ME: "warning",
  CLAIMED_BY_COLLEAGUE: "neutral",
  OFFERED: "dark",
  DECLINED: "neutral",
};
const STATES: IncomingState[] = [
  "NEW",
  "CLAIMED_BY_ME",
  "CLAIMED_BY_COLLEAGUE",
  "OFFERED",
  "DECLINED",
];
const SELECT = "mt-1 block rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm";

/** «Richieste in arrivo» (spec 04, spec 05): the requests in target, by closing. */
export default async function IncomingRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; veicolo?: string; provincia?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("agency");
  const tv = await getTranslations("agency.vehicleTypes");
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.stato && (STATES as string[]).includes(query.stato)) params.set("state", query.stato);
  if (query.veicolo && /^[A-Z_]+$/.test(query.veicolo)) params.set("vehicleType", query.veicolo);
  if (query.provincia && /^[A-Z]{2}$/.test(query.provincia))
    params.set("province", query.provincia);
  const { body: rows } = await api<IncomingRow[]>(`/agency/requests?${params.toString()}`);

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("incoming.title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("incoming.intro")}</p>
      {query.fatto === "rinuncia" ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("incoming.declined")}
        </p>
      ) : null}
      <form className="mt-6 flex flex-wrap items-end gap-4" aria-label={t("incoming.filters")}>
        <label className="text-sm font-medium">
          {t("incoming.state")}
          <select name="stato" defaultValue={query.stato ?? ""} className={SELECT}>
            <option value="">{t("incoming.all")}</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {t(`states.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          {t("incoming.vehicle")}
          <select name="veicolo" defaultValue={query.veicolo ?? ""} className={SELECT}>
            <option value="">{t("incoming.all")}</option>
            {["CAR", "MOTORCYCLE", "MOPED"].map((v) => (
              <option key={v} value={v}>
                {tv(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          {t("incoming.province")}
          <input
            name="provincia"
            defaultValue={query.provincia ?? ""}
            maxLength={2}
            className={`${SELECT} w-20 uppercase`}
          />
        </label>
        <button type="submit" className="rounded-lg border border-warm-200 px-4 py-2 text-sm">
          {t("incoming.apply")}
        </button>
      </form>
      {rows.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("incoming.empty")}</p>
        </Card>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-warm-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-warm-100 text-xs uppercase text-warm-600">
              <tr>
                {[
                  "code",
                  "vehicle",
                  "province",
                  "cu",
                  "claims",
                  "age",
                  "package",
                  "start",
                  "validity",
                  "closes",
                  "state",
                ].map((c) => (
                  <th key={c} scope="col" className="px-3 py-2">
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.auctionId} className="border-t border-warm-200">
                  <td className="px-3 py-2">
                    <Link
                      href={`/richieste-in-arrivo/${r.auctionId}`}
                      className="font-medium underline"
                    >
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.vehicleType ? tv(r.vehicleType) : "—"}</td>
                  <td className="px-3 py-2">{r.province ?? "—"}</td>
                  <td className="px-3 py-2 tabular">{r.cuClass ?? "—"}</td>
                  <td className="px-3 py-2 tabular">{r.claimsLast5y ?? "—"}</td>
                  <td className="px-3 py-2 tabular">{r.youngestDriverAge ?? "—"}</td>
                  <td className="px-3 py-2">{r.packageName ?? "—"}</td>
                  <td className="px-3 py-2 tabular">
                    {r.startDate ? formatDate(r.startDate) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular">
                    {t("days", { days: r.minValidityDays ?? 0 })}
                  </td>
                  <td className="px-3 py-2 tabular">
                    {r.auctionStatus === "OPEN" ? (
                      <Countdown until={r.scheduledCloseAt} closedLabel={t("closed")} />
                    ) : (
                      formatDateTime(r.scheduledCloseAt)
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={TONE[r.state]}>
                      {r.state === "CLAIMED_BY_COLLEAGUE" && r.claimedBy
                        ? t("states.CLAIMED_BY", { name: r.claimedBy })
                        : t(`states.${r.state}`)}
                    </Badge>
                    {r.elsewhere ? (
                      <p className="mt-1 text-xs text-orange-700">
                        {r.elsewhere.offered
                          ? t("incoming.elsewhereOffered", { agency: r.elsewhere.agency })
                          : t("incoming.elsewhereClaimed", { agency: r.elsewhere.agency })}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

import { formatDate, formatEuroCents } from "@astax/shared/format";
import { formatGapPercent, type AgencyRankingView } from "@astax/shared/domain";
import { Badge, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface Bucket {
  key: string;
  invited: number;
  offers: number;
  wins: number;
}

interface Results {
  scope: "OWN" | "AGENCY";
  published: {
    auctionId: string;
    code: string;
    round: number;
    publishedAt: string;
    view: AgencyRankingView;
  }[];
  totals: { invited: number; offers: number; wins: number };
  byProvince: Bucket[];
  byClass: Bucket[];
  byVehicleType: Bucket[];
  byCompany: Bucket[];
}

/**
 * «Risultati» of the agency (spec 04): the published rankings (CLA-02,
 * CLA-03) and the statistics on its own offers. An operator sees only its
 * own (spec 05).
 */
export default async function ResultsPage() {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("results");
  const tv = await getTranslations("agency.vehicleTypes");
  const { status, body } = await api<Results>("/agency/results");
  if (status !== 200) notFound();

  const table = (title: string, rows: Bucket[], label: (key: string) => string, invited = true) => (
    <Card className="mt-4">
      <CardTitle>{title}</CardTitle>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm">{t("noData")}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-warm-600">
              <tr>
                <th className="py-1 pr-3 font-medium">{title}</th>
                {invited && body.scope === "AGENCY" ? (
                  <th className="py-1 pr-3 text-right font-medium">{t("invited")}</th>
                ) : null}
                <th className="py-1 pr-3 text-right font-medium">{t("offers")}</th>
                <th className="py-1 pr-3 text-right font-medium">{t("wins")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1 pr-3">{label(r.key)}</td>
                  {invited && body.scope === "AGENCY" ? (
                    <td className="tabular py-1 pr-3 text-right">{r.invited}</td>
                  ) : null}
                  <td className="tabular py-1 pr-3 text-right">{r.offers}</td>
                  <td className="tabular py-1 pr-3 text-right">{r.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-warm-600">
        {body.scope === "OWN" ? t("scopeOwn") : t("scopeAgency")}
      </p>
      <Card className="mt-6">
        <CardTitle>{t("rankingsTitle")}</CardTitle>
        {body.published.length === 0 ? (
          <p className="mt-2 text-sm">{t("noRankings")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {body.published.map((p) => (
              <li key={p.auctionId} className="py-3">
                <section aria-label={p.code}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {p.code} · {t("publishedOn", { date: formatDate(p.publishedAt) })}
                    </span>
                    {p.view.kind === "RANKED" ? (
                      <Badge tone={p.view.position === 1 ? "success" : "neutral"}>
                        {t("position", { position: p.view.position, total: p.view.total })}
                      </Badge>
                    ) : p.view.kind === "EXCLUDED" ? (
                      <Badge tone="warning">{t("excluded")}</Badge>
                    ) : null}
                  </div>
                  {p.view.kind === "RANKED" ? (
                    <p className="tabular mt-1">
                      {t("first", { amount: formatEuroCents(p.view.firstCents) })}
                      {p.view.secondCents !== null
                        ? ` · ${t("second", { amount: formatEuroCents(p.view.secondCents) })}`
                        : ""}
                      {" · "}
                      {t("own", { amount: formatEuroCents(p.view.ownCents) })}
                      {p.view.position > 1
                        ? ` · ${t("gap", { gap: formatGapPercent(p.view.gapBasisPoints) })}`
                        : ""}
                    </p>
                  ) : p.view.kind === "EXCLUDED" ? (
                    <p className="mt-1">{t("excludedReason", { reason: p.view.reason ?? "—" })}</p>
                  ) : null}
                </section>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <h2 className="mt-8 text-lg font-semibold">{t("statsTitle")}</h2>
      <p className="mt-1 text-sm">
        {t("totals", {
          invited: body.totals.invited,
          offers: body.totals.offers,
          wins: body.totals.wins,
        })}
      </p>
      {table(t("province"), body.byProvince, (k) => k)}
      {table(t("cuClass"), body.byClass, (k) => t("classLabel", { cu: k }))}
      {table(t("vehicleType"), body.byVehicleType, (k) => (tv.has(k) ? tv(k) : k))}
      {table(t("company"), body.byCompany, (k) => k, false)}
    </AppShell>
  );
}

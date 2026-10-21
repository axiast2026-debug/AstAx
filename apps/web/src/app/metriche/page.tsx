import { formatGapPercent } from "@astax/shared/domain";
import { formatEuroCents } from "@astax/shared/format";
import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
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

interface Metrics {
  scope: "OWN" | "AGENCY";
  days: number;
  totals: {
    invited: number;
    offers: number;
    wins: number;
    wonPremiumCents: number;
    responseRateBasisPoints: number | null;
    winRateBasisPoints: number | null;
    averageGapBasisPoints: number | null;
    averageIssuanceMinutes: number | null;
  };
  byProvince: Bucket[];
  byClass: Bucket[];
  byVehicleType: Bucket[];
  byCompany: Bucket[];
}

const PERIODS = ["30", "90", "365"] as const;

/** «73,5 %» from basis points. */
const percent = (basisPoints: number) =>
  `${Math.floor(basisPoints / 100)},${String(basisPoints % 100)
    .padStart(2, "0")
    .slice(0, 1)} %`;

/**
 * «Metriche» of the agency (Dan, 2026-10-21, docs/piano-agenzie.md C): the
 * numbers of a period on the agency's own data; an operator sees its own.
 */
export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ giorni?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("metrics");
  const tr = await getTranslations("results");
  const tv = await getTranslations("agency.vehicleTypes");
  const query = await searchParams;
  const days = (PERIODS as readonly string[]).includes(query.giorni ?? "") ? query.giorni : "30";
  const { status, body } = await api<Metrics>(`/agency/metrics?days=${days}`);
  if (status !== 200) notFound();
  const { totals } = body;

  const tiles: { label: string; value: string }[] = [
    ...(body.scope === "AGENCY" ? [{ label: t("invited"), value: String(totals.invited) }] : []),
    { label: t("offers"), value: String(totals.offers) },
    ...(totals.responseRateBasisPoints !== null
      ? [{ label: t("responseRate"), value: percent(totals.responseRateBasisPoints) }]
      : []),
    { label: t("wins"), value: String(totals.wins) },
    {
      label: t("winRate"),
      value: totals.winRateBasisPoints === null ? "—" : percent(totals.winRateBasisPoints),
    },
    { label: t("wonPremiums"), value: formatEuroCents(totals.wonPremiumCents) },
    {
      label: t("averageGap"),
      value:
        totals.averageGapBasisPoints === null
          ? "—"
          : formatGapPercent(totals.averageGapBasisPoints),
    },
    {
      label: t("averageIssuance"),
      value:
        totals.averageIssuanceMinutes === null
          ? "—"
          : t("hoursMinutes", {
              hours: Math.floor(totals.averageIssuanceMinutes / 60),
              minutes: totals.averageIssuanceMinutes % 60,
            }),
    },
  ];

  const table = (title: string, rows: Bucket[], label: (key: string) => string, invited = true) => (
    <Card className="mt-4">
      <CardTitle>{title}</CardTitle>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm">{tr("noData")}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="text-warm-600">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {title}
                </th>
                {invited && body.scope === "AGENCY" ? (
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {tr("invited")}
                  </th>
                ) : null}
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {tr("offers")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {tr("wins")}
                </th>
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
        {body.scope === "OWN" ? tr("scopeOwn") : tr("scopeAgency")}
      </p>
      <nav aria-label={t("period")} className="mt-4 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/metriche?giorni=${p}`}
            aria-current={p === days ? "page" : undefined}
            className={`rounded-lg border px-3 py-2 text-sm ${p === days ? "border-night-900 bg-night-900 text-white" : "border-warm-200 bg-white hover:bg-warm-100"}`}
          >
            {t(`periods.${p}`)}
          </Link>
        ))}
      </nav>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-warm-200 bg-white p-4">
            <dt className="text-sm text-warm-600">{tile.label}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{tile.value}</dd>
          </div>
        ))}
      </dl>
      {table(tr("company"), body.byCompany, (k) => k, false)}
      {table(tr("province"), body.byProvince, (k) => k)}
      {table(tr("cuClass"), body.byClass, (k) => tr("classLabel", { cu: k }))}
      {table(tr("vehicleType"), body.byVehicleType, (k) => (tv.has(k) ? tv(k) : k))}
    </AppShell>
  );
}

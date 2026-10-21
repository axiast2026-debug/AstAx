import { formatDate, formatEuroCents } from "@astax/shared/format";
import { formatGapPercent, type AgencyRankingView } from "@astax/shared/domain";
import { Badge, Card, CardTitle } from "@astax/ui";
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

type Outcome = "NOT_WON" | "AWAITING_PAYMENT" | "WON";
/**
 * Dan, 2026-10-21 (docs/piano-agenzie.md, step 2): the rankings by outcome.
 * «Vinte» keeps the history of the auctions won (paid), also when the
 * customer chose an offer that was not the first.
 */
const TABS: { slug: string; outcome: Outcome }[] = [
  { slug: "non-vinte", outcome: "NOT_WON" },
  { slug: "in-attesa", outcome: "AWAITING_PAYMENT" },
  { slug: "vinte", outcome: "WON" },
];

interface Results {
  scope: "OWN" | "AGENCY";
  published: {
    auctionId: string;
    code: string;
    round: number;
    publishedAt: string;
    outcome: Outcome;
    view: AgencyRankingView;
  }[];
  totals: {
    invited: number;
    offers: number;
    wins: number;
    averageGapBasisPoints: number | null;
    averageIssuanceMinutes: number | null;
  };
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
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ scheda?: string }>;
}) {
  const viewer = await requireViewer();
  const query = await searchParams;
  const tab = TABS.find((x) => x.slug === query.scheda) ?? {
    slug: "non-vinte",
    outcome: "NOT_WON" as const,
  };
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("results");
  const tv = await getTranslations("agency.vehicleTypes");
  const { status, body } = await api<Results>("/agency/results");
  if (status !== 200) notFound();
  const shown = body.published.filter((p) => p.outcome === tab.outcome);

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
      <nav aria-label={t("tabs.label")} className="mt-6 flex flex-wrap gap-2">
        {TABS.map((x) => {
          const count = body.published.filter((p) => p.outcome === x.outcome).length;
          const current = x.slug === tab.slug;
          return (
            <Link
              key={x.slug}
              href={`/risultati?scheda=${x.slug}`}
              aria-current={current ? "page" : undefined}
              className={`rounded-lg border px-3 py-2 text-sm ${current ? "border-night-900 bg-night-900 text-white" : "border-warm-200 bg-white hover:bg-warm-100"}`}
            >
              {t(`tabs.${x.outcome}`)} ({count})
            </Link>
          );
        })}
      </nav>
      <Card className="mt-4">
        <CardTitle>{t(`tabs.${tab.outcome}`)}</CardTitle>
        <p className="mt-1 text-sm text-warm-600">{t(`tabs.${tab.outcome}_hint`)}</p>
        {shown.length === 0 ? (
          <p className="mt-2 text-sm">{t("noRankings")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {shown.map((p) => (
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
      {body.totals.averageGapBasisPoints !== null ? (
        <p className="mt-1 text-sm">
          {t("averageGap", { gap: formatGapPercent(body.totals.averageGapBasisPoints) })}
        </p>
      ) : null}
      {body.totals.averageIssuanceMinutes !== null ? (
        <p className="mt-1 text-sm">
          {t("averageIssuance", {
            hours: Math.floor(body.totals.averageIssuanceMinutes / 60),
            minutes: body.totals.averageIssuanceMinutes % 60,
          })}
        </p>
      ) : null}
      {table(t("province"), body.byProvince, (k) => k)}
      {table(t("cuClass"), body.byClass, (k) => t("classLabel", { cu: k }))}
      {table(t("vehicleType"), body.byVehicleType, (k) => (tv.has(k) ? tv(k) : k))}
      {table(t("company"), body.byCompany, (k) => k, false)}
    </AppShell>
  );
}

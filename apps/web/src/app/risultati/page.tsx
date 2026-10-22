import { formatDate, formatEuroCents } from "@astax/shared/format";
import { formatGapPercent, type AgencyRankingView } from "@astax/shared/domain";
import { Badge, cn } from "@astax/ui";
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
 * own (spec 05). Area agenzia of the design: a card per auction with the
 * position in Inter Tight and the line of the first, second and own premium.
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
  const { status, body } = await api<Results>("/agency/results");
  if (status !== 200) notFound();
  const shown = body.published.filter((p) => p.outcome === tab.outcome);

  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-screen font-extrabold">{t("title")}</h1>
          <p className="text-table text-warm-600">
            {body.scope === "OWN" ? t("scopeOwn") : t("scopeAgency")}
          </p>
        </div>
        <nav aria-label={t("tabs.label")} className="flex flex-wrap gap-2">
          {TABS.map((x) => {
            const count = body.published.filter((p) => p.outcome === x.outcome).length;
            const current = x.slug === tab.slug;
            return (
              <Link
                key={x.slug}
                href={`/risultati?scheda=${x.slug}`}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg px-4 text-table font-semibold no-underline",
                  current
                    ? "bg-night-900 text-white"
                    : "bg-white text-night-900 shadow-[inset_0_0_0_1px_var(--color-warm-200)] hover:bg-warm-100",
                )}
              >
                {t(`tabs.${x.outcome}`)} ({count})
              </Link>
            );
          })}
        </nav>
        <p className="text-table text-warm-800">{t(`tabs.${tab.outcome}_hint`)}</p>
        {shown.length === 0 ? (
          <div className="rounded-xl bg-white px-4 py-8 text-center text-table shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
            {t("noRankings")}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((p) => (
              <li
                key={p.auctionId}
                className="rounded-xl bg-white px-5 py-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] sm:px-6"
              >
                <section
                  aria-label={p.code}
                  className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-8"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-body font-bold">{p.code}</span>
                      {p.view.kind === "EXCLUDED" ? (
                        <Badge tone="danger">{t("excluded")}</Badge>
                      ) : null}
                    </div>
                    <span className="text-table text-warm-600">
                      {t("publishedOn", { date: formatDate(p.publishedAt) })}
                    </span>
                    {p.view.kind === "RANKED" ? (
                      <p className="text-table tabular">
                        {t("first", { amount: formatEuroCents(p.view.firstCents) })}
                        {p.view.secondCents !== null
                          ? ` · ${t("second", { amount: formatEuroCents(p.view.secondCents) })}`
                          : ""}
                        {" · "}
                        {t("own", { amount: formatEuroCents(p.view.ownCents) })}
                      </p>
                    ) : null}
                    {p.view.kind === "RANKED" && p.view.position > 1 && p.outcome !== "NOT_WON" ? (
                      <p className="text-table font-medium text-green-700">{t("chosenAnyway")}</p>
                    ) : null}
                    {p.view.kind === "EXCLUDED" ? (
                      <p className="text-table text-red-700">
                        {t("excludedReason", { reason: p.view.reason ?? "—" })}
                      </p>
                    ) : null}
                  </div>
                  {p.view.kind === "RANKED" ? <RankLine view={p.view} /> : null}
                </section>
              </li>
            ))}
          </ul>
        )}
        <p className="text-table">
          <Link href="/metriche" className="underline">
            {t("toMetrics")}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

/**
 * The position and a line with a dot for the first, the second and the
 * agency's own offer, nothing else (CLA-02, CLA-03): no other premium, no
 * name. The lowest on the left.
 */
async function RankLine({ view }: { view: Extract<AgencyRankingView, { kind: "RANKED" }> }) {
  const t = await getTranslations("results");
  const top = Math.max(view.ownCents, view.secondCents ?? view.firstCents);
  const at = (cents: number) =>
    top === view.firstCents ? 0 : ((cents - view.firstCents) / (top - view.firstCents)) * 100;
  const dots = [
    ...(view.position === 1
      ? []
      : [{ key: "first", x: at(view.firstCents), own: false, label: t("dotFirst") }]),
    ...(view.secondCents === null || view.position === 2
      ? []
      : [{ key: "second", x: at(view.secondCents), own: false, label: t("dotSecond") }]),
    { key: "own", x: at(view.ownCents), own: true, label: t("dotOwn") },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-section font-extrabold tabular">
          {t("position", { position: view.position, total: view.total })}
        </span>
        {view.position > 1 ? (
          <span className="text-table font-semibold text-warm-600 tabular">
            {t("gap", { gap: formatGapPercent(view.gapBasisPoints) })}
          </span>
        ) : null}
      </div>
      <div aria-hidden className="relative mx-2 h-7">
        <span className="absolute inset-x-0 top-[13px] h-0.5 bg-warm-200" />
        {dots.map((d) => (
          <span
            key={d.key}
            title={d.label}
            className={cn(
              "absolute -translate-x-1/2 rounded-full",
              d.own
                ? "top-1 size-5 bg-orange-500 shadow-[0_0_0_3px_white,0_0_0_4px_var(--color-night-900)]"
                : "top-2 size-3 bg-night-900",
            )}
            style={{ left: `${d.x}%` }}
          />
        ))}
      </div>
      <span className="flex justify-between gap-3 text-note text-warm-600">
        <span className="whitespace-nowrap">{t("lowest")}</span>
        <span className="text-right">{t("anonymous")}</span>
      </span>
    </div>
  );
}

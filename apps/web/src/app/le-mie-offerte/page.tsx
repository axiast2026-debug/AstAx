import { formatDate, formatEuroCents } from "@astax/shared/format";
import { Badge, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import type { MyOfferRow } from "@/lib/agency";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

/** The views of «Le mie offerte» (spec 04), each a set of offer statuses. */
const VIEWS = {
  inCorso: ["SUBMITTED"],
  inAttesa: ["AWAITING_CUSTOMER"],
  vinte: ["WINNING", "ISSUED"],
  nonScelte: ["NOT_CHOSEN", "EXPIRED", "MISSED_ISSUANCE"],
  escluse: ["EXCLUDED"],
  ritirate: ["WITHDRAWN"],
} as const;
type View = keyof typeof VIEWS;

const TONE: Record<string, "success" | "warning" | "neutral" | "danger" | "dark"> = {
  SUBMITTED: "warning",
  AWAITING_CUSTOMER: "dark",
  WINNING: "success",
  ISSUED: "success",
  EXCLUDED: "danger",
};

/**
 * «Le mie offerte» (spec 04): the agency's offers by status. «Offerte aperte»
 * lists those still waiting for the customer with their guarantee date
 * (GAR-08), so the agency knows what it is bound to.
 */
export default async function MyOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("agency.myOffers");
  const ts = await getTranslations("agency.offerStatus");
  const tv = await getTranslations("agency.vehicleTypes");
  const asked = (await searchParams).vista;
  const view: View = asked && asked in VIEWS ? (asked as View) : "inCorso";
  const { body: all } = await api<MyOfferRow[]>("/agency/offers");
  const rows = all.filter((o) => (VIEWS[view] as readonly string[]).includes(o.status));
  const openOffers = all.filter((o) => o.guaranteed);

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <nav aria-label={t("views")} className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={`/le-mie-offerte?vista=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              v === view ? "border-night-900 bg-night-900 text-white" : "border-warm-200"
            }`}
          >
            {t(`view.${v}`, {
              count: all.filter((o) => (VIEWS[v] as readonly string[]).includes(o.status)).length,
            })}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-warm-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-warm-100 text-xs uppercase text-warm-600">
              <tr>
                {["code", "profile", "premium", "company", "guarantee", "author", "status"].map(
                  (c) => (
                    <th key={c} scope="col" className="px-3 py-2">
                      {t(`columns.${c}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-warm-200">
                  <td className="px-3 py-2">
                    <Link
                      href={`/richieste-in-arrivo/${o.auctionId}`}
                      className="font-medium underline"
                    >
                      {o.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {[
                      o.profile.vehicleType ? tv(o.profile.vehicleType) : null,
                      o.profile.province,
                      o.profile.packageCode,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td className="px-3 py-2 tabular">
                    {o.annualGrossPremiumCents === null
                      ? "—"
                      : formatEuroCents(o.annualGrossPremiumCents)}
                  </td>
                  <td className="px-3 py-2">{o.company ?? "—"}</td>
                  <td className="px-3 py-2 tabular">
                    {o.guaranteeUntil ? formatDate(o.guaranteeUntil) : "—"}
                  </td>
                  <td className="px-3 py-2">{o.author ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={TONE[o.status] ?? "neutral"}>{ts(o.status)}</Badge>
                    {o.exclusionReason ? (
                      <p className="mt-1 text-xs text-warm-600">{o.exclusionReason}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="open-offers" className="mt-10">
        <h2 id="open-offers" className="text-xl font-semibold">
          {t("openTitle")}
        </h2>
        <p className="mt-1 text-sm text-warm-600">{t("openIntro")}</p>
        {openOffers.length === 0 ? (
          <p className="mt-3 text-sm">{t("openEmpty")}</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {openOffers.map((o) => (
              <li key={o.id}>
                {t("openRow", {
                  code: o.code,
                  company: o.company ?? "—",
                  date: o.guaranteeUntil ? formatDate(o.guaranteeUntil) : "—",
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

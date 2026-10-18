import { formatEuroCents } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getLocale, getTranslations } from "next-intl/server";
import { api } from "@/lib/auth";

interface Dashboard {
  filter: { from: string; to: string; channel?: string; province?: string };
  volumes: {
    created: number;
    submitted: number;
    auctions: number;
    deserted: number;
    accepted: number;
    issued: number;
  };
  funnel: {
    auctionsWithOffers: number;
    offersPerAuction: number | null;
    acceptedOfSubmitted: number | null;
  };
  quality: {
    verifications: number;
    averageVerificationMinutes: number | null;
    automaticShare: number | null;
    integrationShare: number | null;
  };
  agencies: {
    invitations: number;
    offers: number;
    participation: number | null;
    averageIssuanceHours: number | null;
  };
  economy: {
    privateFeesCents: number;
    brokerFeesCents: number;
    agencyFeesCents: number;
    creditNotesCents: number;
    premiumsCents: number;
  };
  risk: { complaints: number; flags: number; penalties: number; activeSuspensions: number };
}

const field = "rounded-lg border border-warm-200 px-3 py-2";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Spec 07 «Cruscotto»: volumes, steps, quality, agencies, economy and risk
 * of a period, with the filters for channel and province (proposal I:
 * plain tables and bars).
 */
export async function AdminDashboard({
  query,
}: {
  query: { da?: string; a?: string; canale?: string; provincia?: string };
}) {
  const t = await getTranslations("adminDashboard");
  const locale = (await getLocale()) === "sq" ? "sq" : "it";
  const params = new URLSearchParams();
  if (query.da && DAY.test(query.da)) params.set("from", query.da);
  if (query.a && DAY.test(query.a)) params.set("to", query.a);
  if (query.canale === "PRIVATE" || query.canale === "BROKER") params.set("channel", query.canale);
  if (query.provincia && /^[A-Za-z]{2}$/.test(query.provincia)) {
    params.set("province", query.provincia.toUpperCase());
  }
  const { status, body: d } = await api<Dashboard>(`/admin/dashboard?${params.toString()}`);
  if (status !== 200) return null;
  const money = (cents: number) => formatEuroCents(cents, locale);
  const pct = (value: number | null) => (value === null ? "—" : t("percent", { value }));
  const steps: [string, number][] = [
    ["submitted", d.volumes.submitted],
    ["auctions", d.volumes.auctions],
    ["accepted", d.volumes.accepted],
    ["issued", d.volumes.issued],
  ];
  const top = Math.max(1, ...steps.map(([, n]) => n));

  return (
    <>
      <h2 className="mt-6 text-xl font-semibold">{t("title")}</h2>
      <form method="get" className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">
          {t("from")}
          <input type="date" name="da" defaultValue={d.filter.from} className={field} />
        </label>
        <label className="grid gap-1">
          {t("to")}
          <input type="date" name="a" defaultValue={d.filter.to} className={field} />
        </label>
        <label className="grid gap-1">
          {t("channel")}
          <select name="canale" defaultValue={d.filter.channel ?? ""} className={field}>
            <option value="">{t("allChannels")}</option>
            <option value="PRIVATE">{t("channels.PRIVATE")}</option>
            <option value="BROKER">{t("channels.BROKER")}</option>
          </select>
        </label>
        <label className="grid gap-1">
          {t("province")}
          <input
            name="provincia"
            maxLength={2}
            defaultValue={d.filter.province ?? ""}
            className={`${field} w-20`}
          />
        </label>
        <Button type="submit" size="sm">
          {t("apply")}
        </Button>
      </form>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("funnel")}</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {steps.map(([key, n]) => (
              <li key={key}>
                <div className="flex justify-between">
                  <span>{t(`steps.${key}`)}</span>
                  <span className="font-semibold">{n}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-warm-100" aria-hidden="true">
                  <div
                    className="h-2 rounded bg-night-900"
                    style={{ width: `${Math.round((n / top) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-warm-600">
            {t("funnelNotes", {
              created: d.volumes.created,
              deserted: d.volumes.deserted,
              offers: d.funnel.offersPerAuction ?? 0,
              conversion: pct(d.funnel.acceptedOfSubmitted),
            })}
          </p>
        </Card>

        <Card>
          <CardTitle>{t("quality")}</CardTitle>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-2 text-sm">
            <dt>{t("verifications")}</dt>
            <dd>{d.quality.verifications}</dd>
            <dt>{t("averageVerification")}</dt>
            <dd>
              {d.quality.averageVerificationMinutes === null
                ? "—"
                : t("minutes", { count: d.quality.averageVerificationMinutes })}
            </dd>
            <dt>{t("automaticShare")}</dt>
            <dd>{pct(d.quality.automaticShare)}</dd>
            <dt>{t("integrationShare")}</dt>
            <dd>{pct(d.quality.integrationShare)}</dd>
          </dl>
        </Card>

        <Card>
          <CardTitle>{t("agencies")}</CardTitle>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-2 text-sm">
            <dt>{t("invitations")}</dt>
            <dd>{d.agencies.invitations}</dd>
            <dt>{t("offers")}</dt>
            <dd>{d.agencies.offers}</dd>
            <dt>{t("participation")}</dt>
            <dd>{pct(d.agencies.participation)}</dd>
            <dt>{t("issuanceTime")}</dt>
            <dd>
              {d.agencies.averageIssuanceHours === null
                ? "—"
                : t("hours", { count: d.agencies.averageIssuanceHours })}
            </dd>
          </dl>
        </Card>

        <Card>
          <CardTitle>{t("economy")}</CardTitle>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-2 text-sm">
            <dt>{t("privateFees")}</dt>
            <dd>{money(d.economy.privateFeesCents)}</dd>
            <dt>{t("brokerFees")}</dt>
            <dd>{money(d.economy.brokerFeesCents)}</dd>
            <dt>{t("agencyFees")}</dt>
            <dd>{money(d.economy.agencyFeesCents)}</dd>
            <dt>{t("creditNotes")}</dt>
            <dd>{money(d.economy.creditNotesCents)}</dd>
            <dt>{t("premiums")}</dt>
            <dd>{money(d.economy.premiumsCents)}</dd>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>{t("risk")}</CardTitle>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(["complaints", "flags", "penalties", "activeSuspensions"] as const).map((k) => (
              <div key={k}>
                <dt className="text-warm-600">{t(`riskItems.${k}`)}</dt>
                <dd className="text-2xl font-bold">{d.risk[k]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}

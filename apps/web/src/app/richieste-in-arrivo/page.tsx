import { startTexts } from "@/lib/start";
import { formatDateTime } from "@astax/shared/format";
import { Badge, buttonVariants, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { realtimeTicket } from "@/app/actions";
import { ArrivalAnnouncer, ArrivalRow } from "@/components/arrival";
import { ClosesIn } from "@/components/countdown-ring";
import { IncomingBadge } from "@/components/incoming-badge";
import { LiveRefresh } from "@/components/live-refresh";
import { api } from "@/lib/auth";
import type { IncomingRow, IncomingState } from "@/lib/agency";
import { requireViewer } from "@/lib/me";
import { Info } from "@/components/info";

const STATES: IncomingState[] = [
  "NEW",
  "CLAIMED_BY_ME",
  "CLAIMED_BY_COLLEAGUE",
  "OFFERED",
  "DECLINED",
];
const LABEL = "flex flex-col gap-1 text-label font-semibold";
const SELECT =
  "h-10 min-w-30 rounded-lg bg-white px-2 text-table font-normal text-night-900 shadow-[inset_0_0_0_1px_var(--color-warm-600)]";
const COLUMNS = [
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
] as const;
const CARD_FIELDS = COLUMNS.filter(
  (c): c is Exclude<(typeof COLUMNS)[number], "code" | "closes" | "state"> =>
    c !== "code" && c !== "closes" && c !== "state",
);
/** Hours for «Chiude entro». */
const CLOSES_WITHIN = ["1", "4", "24"] as const;

/**
 * «Partecipa all'asta» (spec 04, spec 05; Dan 2026-10-21, docs/piano-agenzie.md
 * B; Area agenzia of the design): the auctions in target, by closing, with the
 * filters to find them. On top the radar (P5) of those that close soon without
 * an offer of yours; a table on a wide screen, cards on a tablet or phone.
 */
export default async function IncomingRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    stato?: string;
    veicolo?: string;
    provincia?: string;
    asta?: string;
    chiude?: string;
    pacchetto?: string;
    documenti?: string;
    classeDa?: string;
    classeA?: string;
    sinistri?: string;
    etaDa?: string;
    etaA?: string;
    miei?: string;
    fatto?: string;
  }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("agency");
  const startText = await startTexts();
  const tv = await getTranslations("agency.vehicleTypes");
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.stato && (STATES as string[]).includes(query.stato)) params.set("state", query.stato);
  if (query.veicolo && /^[A-Z_]+$/.test(query.veicolo)) params.set("vehicleType", query.veicolo);
  if (query.provincia && /^[A-Z]{2}$/.test(query.provincia))
    params.set("province", query.provincia);
  if (query.asta === "OPEN" || query.asta === "CLOSED") params.set("auction", query.asta);
  if (query.chiude && (CLOSES_WITHIN as readonly string[]).includes(query.chiude))
    params.set("closesWithinHours", query.chiude);
  if (query.pacchetto && /^[A-Z_]+$/.test(query.pacchetto))
    params.set("packageCode", query.pacchetto);
  if (query.documenti === "senza") params.set("withoutDocuments", "1");
  // Dan, 2026-10-29: the filters of «I miei filtri» by hand, or the saved ones with one button.
  const numbers = [
    ["classeDa", "cuClassMin"],
    ["classeA", "cuClassMax"],
    ["sinistri", "maxClaims"],
    ["etaDa", "driverAgeMin"],
    ["etaA", "driverAgeMax"],
  ] as const;
  for (const [name, param] of numbers) {
    const v = query[name];
    if (v && /^\d{1,3}$/.test(v)) params.set(param, v);
  }
  const mine = query.miei === "1";
  if (mine) params.set("mine", "1");
  const [{ body: rows }, options] = await Promise.all([
    api<IncomingRow[]>(`/agency/requests?${params.toString()}`),
    api<{ choices?: { packages: { code: string; name: string }[] } }>("/agency/filters"),
  ]);
  const packages = options.status === 200 ? (options.body.choices?.packages ?? []) : [];

  const scope = viewer.activeMembership.id;
  const radar = rows.filter((r) => r.urgent && r.live);
  const closes = (r: IncomingRow) =>
    r.auctionStatus === "OPEN" && r.live ? (
      <ClosesIn time={r.live} size={24} />
    ) : (
      formatDateTime(r.scheduledCloseAt)
    );
  const tags = (r: IncomingRow) => (
    <>
      {r.kind === "RECONFIRMATION" ? (
        <Badge tone="warning">{t("incoming.reconfirmation")}</Badge>
      ) : null}
      {r.withoutDocuments ? <Badge tone="warning">{t("incoming.noDocuments")}</Badge> : null}
    </>
  );
  const elsewhere = (r: IncomingRow) =>
    r.elsewhere ? (
      <p className="mt-1 text-note text-orange-700">
        {r.elsewhere.offered
          ? t("incoming.elsewhereOffered", { agency: r.elsewhere.agency })
          : t("incoming.elsewhereClaimed", { agency: r.elsewhere.agency })}
      </p>
    ) : null;
  const cells = (r: IncomingRow) => ({
    vehicle: r.vehicleType ? tv(r.vehicleType) : "—",
    province: r.province ?? "—",
    cu: r.cuClass ?? "—",
    claims: r.claimsLast5y ?? "—",
    age: r.youngestDriverAge ?? "—",
    package: r.packageName ?? "—",
    start: startText(r) || "—",
    validity: t("days", { days: r.minValidityDays ?? 0 }),
  });

  return (
    <AppShell viewer={viewer}>
      {/* A new request in target comes in without reloading (ADR 0008). */}
      <LiveRefresh ticket={realtimeTicket} follow="incoming" />
      <div className="flex flex-col gap-4">
        {radar.length > 0 ? (
          <section
            aria-label={t("incoming.radarLabel")}
            className="on-dark flex flex-col gap-3 rounded-xl bg-night-900 px-4 py-3 text-white md:flex-row md:items-center md:gap-4"
          >
            <span className="flex flex-none flex-col">
              <span className="text-table font-bold">{t("incoming.radarTitle")}</span>
              <span className="text-note text-night-300">{t("incoming.radarNote")}</span>
            </span>
            <ul className="flex flex-wrap gap-2">
              {radar.map((r) => (
                <li key={r.auctionId}>
                  <Link
                    href={`/richieste-in-arrivo/${r.auctionId}`}
                    className="flex min-h-11 items-center gap-2 rounded-lg bg-night-800 py-1 pr-3 pl-1.5 text-white no-underline hover:bg-night-700"
                  >
                    {r.live ? <ClosesIn time={r.live} size={32} onDark /> : null}
                    <span className="text-table font-semibold tabular">
                      {r.code}
                      {r.province ? ` · ${r.province}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-col gap-1">
          <h1 className="font-display text-screen font-extrabold">
            {t("incoming.title")}
            <Info>{t("incoming.intro")}</Info>
          </h1>
        </div>
        {query.fatto === "rinuncia" ? (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-table text-green-700">
            {t("incoming.declined")}
          </p>
        ) : null}
        <form className="flex flex-wrap items-end gap-3" aria-label={t("incoming.filters")}>
          <label className={LABEL}>
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
          <label className={LABEL}>
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
          <label className={LABEL}>
            {t("incoming.province")}
            <input
              name="provincia"
              defaultValue={query.provincia ?? ""}
              maxLength={2}
              className={`${SELECT} w-20 min-w-0 uppercase`}
            />
          </label>
          <label className={LABEL}>
            {t("incoming.auction")}
            <select name="asta" defaultValue={query.asta ?? ""} className={SELECT}>
              <option value="">{t("incoming.all")}</option>
              <option value="OPEN">{t("incoming.open")}</option>
              <option value="CLOSED">{t("incoming.closedAuctions")}</option>
            </select>
          </label>
          <label className={LABEL}>
            {t("incoming.closesWithin")}
            <select name="chiude" defaultValue={query.chiude ?? ""} className={SELECT}>
              <option value="">{t("incoming.any")}</option>
              {CLOSES_WITHIN.map((h) => (
                <option key={h} value={h}>
                  {t("incoming.hours", { hours: Number(h) })}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            {t("incoming.package")}
            <select name="pacchetto" defaultValue={query.pacchetto ?? ""} className={SELECT}>
              <option value="">{t("incoming.all")}</option>
              {packages.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-table font-semibold">
            <input
              type="checkbox"
              name="documenti"
              value="senza"
              defaultChecked={query.documenti === "senza"}
              className="size-5 accent-night-900"
            />
            {t("incoming.withoutDocuments")}
          </label>
          {numbers.map(([name]) => (
            <label key={name} className="text-label font-semibold">
              {t(`incoming.numbers.${name}`)}
              <input
                type="number"
                inputMode="numeric"
                name={name}
                min={0}
                defaultValue={query[name] ?? ""}
                className={`${SELECT} w-24`}
              />
            </label>
          ))}
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("incoming.apply")}
          </button>
          <button
            type="submit"
            name="miei"
            value="1"
            className={buttonVariants({ variant: mine ? "primary" : "outline", size: "sm" })}
          >
            {t("incoming.applyMine")}
          </button>
        </form>
        {mine ? (
          <p role="status" className="text-table text-warm-700">
            {t("incoming.mineApplied")}{" "}
            <Link href="/filtri" className="underline">
              {t("incoming.mineEdit")}
            </Link>
          </p>
        ) : null}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-4 py-10 text-center shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
            <span className="text-warm-600">
              <Icon name="envelope" size={28} />
            </span>
            <p className="text-table">{t("incoming.empty")}</p>
          </div>
        ) : (
          <>
            {/* Wide screen: the table of the spec, with the ring in «Chiude tra». */}
            <div className="isolate hidden overflow-x-auto rounded-xl bg-white shadow-[inset_0_0_0_1px_var(--color-warm-200)] xl:block">
              <table className="w-full text-left text-table">
                <caption className="sr-only">{t("incoming.title")}</caption>
                <thead className="bg-warm-100 text-note text-warm-800">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c} scope="col" className="px-2 py-2 font-semibold first:pl-4">
                        {t(`columns.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const c = cells(r);
                    return (
                      <ArrivalRow
                        key={r.auctionId}
                        id={r.auctionId}
                        scope={scope}
                        className="border-t border-warm-200 align-middle hover:bg-warm-50"
                      >
                        <td className="py-2 pr-2 pl-4 whitespace-nowrap">
                          <Link
                            href={`/richieste-in-arrivo/${r.auctionId}`}
                            className="font-semibold underline underline-offset-2"
                          >
                            {r.code}
                          </Link>
                          <span className="mt-1 flex flex-wrap gap-1 empty:hidden">{tags(r)}</span>
                        </td>
                        <td className="px-2 py-2">{c.vehicle}</td>
                        <td className="px-2 py-2">{c.province}</td>
                        <td className="px-2 py-2 tabular">{c.cu}</td>
                        <td className="px-2 py-2 tabular">{c.claims}</td>
                        <td className="px-2 py-2 tabular">{c.age}</td>
                        <td className="px-2 py-2">{c.package}</td>
                        <td className="px-2 py-2 tabular">{c.start}</td>
                        <td className="px-2 py-2 tabular">{c.validity}</td>
                        <td className="px-2 py-2 tabular whitespace-nowrap">{closes(r)}</td>
                        <td className="px-2 py-2">
                          <IncomingBadge state={r.state} claimedBy={r.claimedBy} />
                          {elsewhere(r)}
                        </td>
                      </ArrivalRow>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tablet and phone: one card per request, two columns from the tablet. */}
            <ul className="isolate grid gap-3 md:grid-cols-2 xl:hidden">
              {rows.map((r) => {
                const c = cells(r);
                return (
                  <ArrivalRow
                    key={r.auctionId}
                    id={r.auctionId}
                    scope={scope}
                    as="li"
                    className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="flex flex-col gap-1">
                        <Link
                          href={`/richieste-in-arrivo/${r.auctionId}`}
                          className="text-body font-semibold underline underline-offset-2"
                        >
                          {r.code}
                        </Link>
                        <span className="flex flex-wrap gap-1 empty:hidden">{tags(r)}</span>
                      </span>
                      <IncomingBadge state={r.state} claimedBy={r.claimedBy} />
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2 text-table">
                      <span className="text-warm-600">{t("columns.closes")}</span>
                      {closes(r)}
                    </p>
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-table tabular">
                      {CARD_FIELDS.map((k) => (
                        <div key={k} className="contents">
                          <dt className="text-warm-600">{t(`columns.${k}`)}</dt>
                          <dd>{c[k]}</dd>
                        </div>
                      ))}
                    </dl>
                    {elsewhere(r)}
                  </ArrivalRow>
                );
              })}
            </ul>
          </>
        )}
        <ArrivalAnnouncer
          scope={scope}
          rows={rows.map((r) => ({ id: r.auctionId, code: r.code }))}
        />
      </div>
    </AppShell>
  );
}

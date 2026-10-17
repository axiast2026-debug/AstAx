import { formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { realtimeTicket } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import {
  advanceClock,
  resetClock,
  cancelAuction,
  decideQuoteCheck,
  extendAuction,
  fireNextTimer,
  inviteAgencies,
  sendTestOffers,
} from "./actions";

/** Development tools: only with DEV_TOOLS=true, never in production (rule 13). */
const DEV_TOOLS = process.env.DEV_TOOLS === "true" && process.env.NODE_ENV !== "production";

interface AuctionRow {
  auctionId: string;
  requestId: string;
  code: string;
  kind: string;
  round: number;
  status: string;
  requestStatus: string;
  scheduledCloseAt: string;
  extended: boolean;
  invited: number;
  offers: number | null;
  closedAt: string | null;
}

interface QuoteCheck {
  id: string;
  requestCode: string;
  agency: string;
  company: string;
  offerStatus: string;
  differences: { field: string; declared: string | number; read: string | number }[];
  checkedAt: string;
  decision: "EXCLUDED" | "KEPT" | null;
  excludable: boolean;
}

/** OFF-09: the PDF quotes that differ from the declared offer, for the back office to decide. */
async function QuoteChecks() {
  const t = await getTranslations("auctions.checks");
  const { status, body: checks } = await api<QuoteCheck[]>("/back-office/quote-checks");
  if (status !== 200 || checks.length === 0) return null;
  const value = (field: string, v: string | number) =>
    field === "annualGrossPremiumCents" && typeof v === "number" ? formatEuroCents(v) : String(v);
  return (
    <section aria-labelledby="quote-checks" className="mt-6">
      <h2 id="quote-checks" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      <div className="mt-3 space-y-3">
        {checks.map((c) => (
          <Card
            key={c.id}
            role="region"
            aria-label={t("region", { code: c.requestCode, agency: c.agency })}
          >
            <p className="font-semibold">{`${c.requestCode} · ${c.agency} · ${c.company}`}</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {c.differences.map((d) => (
                <li key={d.field}>
                  {t("difference", {
                    field: t(`fields.${d.field}`),
                    declared: value(d.field, d.declared),
                    read: value(d.field, d.read),
                  })}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-warm-600">
              {t("checkedAt", { at: formatDateTime(c.checkedAt) })}
            </p>
            {c.decision ? (
              <Badge className="mt-2" tone={c.decision === "EXCLUDED" ? "danger" : "neutral"}>
                {t(`decision.${c.decision}`)}
              </Badge>
            ) : (
              <form action={decideQuoteCheck} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="checkId" value={c.id} />
                <input
                  name="reason"
                  required
                  minLength={3}
                  placeholder={t("reason")}
                  aria-label={t("reason")}
                  className={`${INPUT} flex-1`}
                />
                {c.excludable ? (
                  <Button type="submit" name="decision" value="EXCLUDED" size="sm">
                    {t("exclude")}
                  </Button>
                ) : (
                  <span className="text-xs text-warm-600">{t("notExcludable")}</span>
                )}
                <Button type="submit" name="decision" value="KEPT" size="sm" variant="outline">
                  {t("keep")}
                </Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

const TONE = {
  OPEN: "success",
  CLOSING: "warning",
  CLOSED: "neutral",
  CANCELLED: "danger",
} as const;
const INPUT = "rounded-lg border border-warm-200 bg-white px-2 py-1 text-sm";

/**
 * The back office list of auctions (spec 06 «Aste»), in real time: counters
 * and times, never a price before the closing (BC-01). Every action has a
 * reason and is logged (ASTA-06).
 */
export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("auctions");
  const query = await searchParams;
  const { status, body } = await api<{
    auctions: AuctionRow[];
    agencies: { id: string; name: string }[];
  }>("/auctions");
  if (status === 403 || status === 404) notFound();
  if (status !== 200) {
    // An error of the API (for example a timeout): a message, never a broken page.
    return (
      <AppShell viewer={viewer}>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm">
          {t("error", { code: String(status) })}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell viewer={viewer}>
      <LiveRefresh ticket={realtimeTicket} follow="auctions" />
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done")}
        </p>
      ) : null}
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm">
          {t("error", { code: query.errore })}
        </p>
      ) : null}
      {DEV_TOOLS ? (
        <Card className="mt-6 border-dashed border-orange-500">
          <p className="text-sm font-semibold">{t("dev.title")}</p>
          <p className="mt-1 text-xs text-warm-600">{t("dev.intro")}</p>
          <form action={advanceClock} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              {t("dev.minutes")}
              <input
                name="minutes"
                type="number"
                min={1}
                defaultValue={60}
                className={`${INPUT} ml-2 w-24`}
              />
            </label>
            <Button type="submit" size="sm" variant="outline">
              {t("dev.advanceClock")}
            </Button>
          </form>
          <form action={resetClock} className="mt-2">
            <Button type="submit" size="sm" variant="outline">
              {t("dev.resetClock")}
            </Button>
          </form>
        </Card>
      ) : null}
      <QuoteChecks />
      {body.auctions.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          {body.auctions.map((a) => (
            <Card key={a.auctionId} role="region" aria-label={a.code}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{a.code}</span>
                <Badge tone={TONE[a.status as keyof typeof TONE] ?? "neutral"}>
                  {t(`status.${a.status}`)}
                </Badge>
                <span className="text-sm text-warm-600">
                  {t("round", { round: a.round, kind: t(`kind.${a.kind}`) })}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <dt className="text-warm-600">{t("closesAt")}</dt>
                <dd className="tabular">
                  {formatDateTime(a.scheduledCloseAt)}
                  {a.extended ? ` · ${t("extended")}` : ""}
                </dd>
                <dt className="text-warm-600">{t("invited")}</dt>
                <dd className="tabular">{a.invited}</dd>
                <dt className="text-warm-600">{t("offers")}</dt>
                <dd className="tabular">{a.offers ?? "—"}</dd>
                {a.closedAt ? (
                  <>
                    <dt className="text-warm-600">{t("closedAt")}</dt>
                    <dd className="tabular">{formatDateTime(a.closedAt)}</dd>
                  </>
                ) : null}
              </dl>
              {DEV_TOOLS &&
              ["AUCTION_OPEN", "OFFERS_AVAILABLE", "IN_RECONFIRMATION"].includes(
                a.requestStatus,
              ) ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-dashed border-orange-500 pt-3">
                  {a.status === "OPEN" ? (
                    <form action={sendTestOffers}>
                      <input type="hidden" name="auctionId" value={a.auctionId} />
                      <input type="hidden" name="count" value={3} />
                      <Button type="submit" size="sm" variant="outline">
                        {t("dev.testOffers")}
                      </Button>
                    </form>
                  ) : null}
                  <form action={fireNextTimer}>
                    <input type="hidden" name="requestId" value={a.requestId} />
                    <Button type="submit" size="sm" variant="outline">
                      {t("dev.fireNextTimer")}
                    </Button>
                  </form>
                </div>
              ) : null}
              {a.status === "OPEN" ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <form action={extendAuction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="auctionId" value={a.auctionId} />
                    <label className="text-sm">
                      {t("hours")}
                      <input
                        name="workingHours"
                        type="number"
                        min={1}
                        defaultValue={1}
                        required
                        className={`${INPUT} ml-2 w-16`}
                      />
                    </label>
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder={t("reason")}
                      aria-label={t("reason")}
                      className={`${INPUT} flex-1`}
                    />
                    <Button type="submit" size="sm" variant="outline">
                      {t("extend")}
                    </Button>
                  </form>
                  <form action={inviteAgencies} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="auctionId" value={a.auctionId} />
                    <select
                      name="organizationId"
                      required
                      aria-label={t("agency")}
                      className={INPUT}
                    >
                      {body.agencies.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder={t("reason")}
                      aria-label={t("reason")}
                      className={`${INPUT} flex-1`}
                    />
                    <Button type="submit" size="sm" variant="outline">
                      {t("invite")}
                    </Button>
                  </form>
                  <form action={cancelAuction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="auctionId" value={a.auctionId} />
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder={t("reason")}
                      aria-label={t("reason")}
                      className={`${INPUT} flex-1`}
                    />
                    <Button type="submit" size="sm" variant="danger">
                      {t("cancel")}
                    </Button>
                  </form>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

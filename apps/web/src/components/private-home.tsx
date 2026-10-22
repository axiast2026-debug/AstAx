import { formatDate, formatTime, formatWeekdayDate, romeCalendarDate } from "@astax/shared/format";
import { Button, buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createPrivateRequest } from "@/app/request-actions";
import { CountdownRing, type WorkingTime } from "@/components/countdown-ring";
import { StatusBadge } from "@/components/request-view";
import type { PolicyRow } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import type { RequestSummary } from "@/lib/requests";

/** Requests that are over, or that live on as a policy, are not on the home. */
const HIDDEN = ["CANCELLED", "EXCLUDED", "ISSUED"];
/** Requests whose round is running: the card shows the time ring. */
const LIVE = ["AUCTION_OPEN", "IN_RECONFIRMATION"];

interface LiveStatus {
  serverNow: string;
  auction:
    | (Omit<WorkingTime, "serverNow"> & {
        scheduledCloseAt: string;
        offers: number | null;
        status: string;
      })
    | null;
}

/**
 * The one action a request asks of the customer now (docs/piano-flusso-semplificato.md,
 * «Area del privato»), or none while AstAx or the agencies are working on it.
 */
function nextAction(r: RequestSummary): { key: string; href: string } | null {
  const base = `/preventivi/${r.id}`;
  switch (r.status) {
    case "DRAFT":
      return { key: "continue", href: base };
    case "INTEGRATION_REQUESTED":
      return { key: "complete", href: base };
    case "OFFERS_AVAILABLE":
    case "EXPIRED":
      return { key: "offers", href: `${base}#offerte` };
    case "ACCEPTED":
      return { key: "signAndPay", href: `${base}/accettazione` };
    default:
      return null;
  }
}

/**
 * Home of the private customer: one card for each thing in progress, with its
 * status and a single button for the next step, then the active policies.
 */
export async function PrivateHome({ firstName }: { firstName: string }) {
  const t = await getTranslations("home");
  const [{ body: requests }, { body: policies }] = await Promise.all([
    api<RequestSummary[]>("/requests"),
    api<PolicyRow[]>("/policies"),
  ]);
  const open = (requests ?? []).filter((r) => !HIDDEN.includes(r.status));
  // Momento 1: during an auction the card shows its time and envelopes, no button.
  const live = new Map(
    await Promise.all(
      open
        .filter((r) => LIVE.includes(r.status))
        .map(
          async (r) => [r.id, (await api<LiveStatus>(`/requests/${r.id}/auction`)).body] as const,
        ),
    ),
  );
  const active = (policies ?? []).filter((p) => ["ACTIVE", "EXPIRING"].includes(p.status));
  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>{t("welcome", { name: firstName })}</CardTitle>
        <p className="mt-2 text-warm-600">{t("privateIntro")}</p>
        <form action={createPrivateRequest} className="mt-4">
          <Button type="submit" size="lg" className="w-full sm:w-auto">
            {t("newQuote")}
          </Button>
        </form>
      </Card>

      {open.length > 0 ? (
        <section aria-labelledby="in-progress" className="space-y-3">
          <h2 id="in-progress" className="text-lg font-semibold">
            {t("inProgress")}
          </h2>
          {open.map((r) => {
            const action = nextAction(r);
            return (
              <Card key={r.id} role="region" aria-label={t("requestCard", { code: r.code })}>
                <div className="flex flex-wrap items-center gap-3">
                  <CardTitle>{r.plate ? `${r.plate} · ${r.code}` : r.code}</CardTitle>
                  <StatusBadge status={r.status} />
                </div>
                {(() => {
                  const s = live.get(r.id);
                  const a = s?.auction;
                  if (!s || !a || a.status !== "OPEN" || a.workingSecondsLeft === undefined)
                    return null;
                  const time: WorkingTime = { ...a, serverNow: s.serverNow };
                  const today = romeCalendarDate(new Date(s.serverNow));
                  const at = (iso: string) =>
                    romeCalendarDate(new Date(iso)) === today
                      ? t("todayAt", { time: formatTime(iso) })
                      : t("dayAt", { day: formatWeekdayDate(iso), time: formatTime(iso) });
                  return (
                    <div className="mt-3 flex items-center gap-4">
                      <CountdownRing
                        time={time}
                        size={96}
                        resumeLabel={a.pausedUntil ? at(a.pausedUntil) : null}
                      />
                      <span className="flex flex-col gap-1">
                        <span className="font-display text-screen font-extrabold tabular">
                          {a.offers ?? 0}
                        </span>
                        <span className="text-table text-warm-600">
                          {t("envelopes", { count: a.offers ?? 0 })}
                        </span>
                        <span className="text-label font-semibold">
                          {t("closes", { when: at(a.scheduledCloseAt) })}
                        </span>
                      </span>
                    </div>
                  );
                })()}
                <p className="mt-2 text-sm text-warm-600">{t(`statusHint.${r.status}`)}</p>
                <div className="mt-3">
                  {action ? (
                    <Link
                      href={action.href}
                      className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
                    >
                      {t(`actions.${action.key}`)}
                    </Link>
                  ) : (
                    <Link
                      href={`/preventivi/${r.id}`}
                      className="inline-flex min-h-11 items-center text-sm font-medium underline"
                    >
                      {t("open")}
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}

      {active.length > 0 ? (
        <section aria-labelledby="my-policies" className="space-y-3">
          <h2 id="my-policies" className="text-lg font-semibold">
            {t("myPolicies")}
          </h2>
          {active.map((p) => {
            const policy = p.documents?.find((d) => d.kind === "ISSUED_POLICY");
            return (
              <Card
                key={p.id}
                role="region"
                aria-label={t("policyCard", { number: p.policyNumber })}
              >
                <CardTitle>{`${p.plate} · ${p.company}`}</CardTitle>
                <p className="mt-2 text-sm text-warm-600">
                  {t("policyUntil", { number: p.policyNumber, end: formatDate(p.endDate) })}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {p.renewable && !p.renewalRequestId ? (
                    <Link
                      href="/polizze"
                      className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
                    >
                      {t("actions.renew")}
                    </Link>
                  ) : null}
                  {policy && p.requestId ? (
                    <a
                      href={`/preventivi/${p.requestId}/documenti/${policy.id}`}
                      target="_blank"
                      rel="noopener"
                      className={buttonVariants({
                        variant: p.renewable ? "outline" : "primary",
                        size: "lg",
                        className: "w-full sm:w-auto",
                      })}
                    >
                      {t("actions.downloadPolicy")}
                    </a>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

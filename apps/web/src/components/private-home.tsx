import { formatDate } from "@astax/shared/format";
import { Button, buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createPrivateRequest } from "@/app/request-actions";
import { StatusBadge } from "@/components/request-view";
import type { PolicyRow } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import type { RequestSummary } from "@/lib/requests";

/** Requests that are over, or that live on as a policy, are not on the home. */
const HIDDEN = ["CANCELLED", "EXCLUDED", "ISSUED"];

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
                    <Link href={`/preventivi/${r.id}`} className="text-sm font-medium underline">
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

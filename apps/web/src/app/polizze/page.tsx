import { startTexts } from "@/lib/start";
import { formatDate, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card } from "@astax/ui";
import { can } from "@astax/shared/permissions";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary } from "@/components/form";
import type { PolicyRow } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { priceWithdrawal, renewPolicy, requestWithdrawal } from "../policy-actions";

interface WithdrawalRow {
  id: string;
  code: string;
  policyNumber: string;
  premiumCents: number;
  requestedAt: string;
  refundableCents: number | null;
  status: "REQUESTED" | "PRICED" | "APPROVED" | "REJECTED";
}

const TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  ACTIVE: "success",
  EXPIRING: "warning",
  EXPIRED: "neutral",
  WITHDRAWN: "danger",
  CANCELLED: "danger",
};

/**
 * «Polizze» (spec 03 and 02) and «Polizze emesse» (spec 04): the private
 * user's policies with their documents and the fee invoice; the broker's,
 * for their customers; the agency's, issued by it.
 */
export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; recesso?: string; prezzato?: string; vista?: string }>;
}) {
  const query = await searchParams;
  const viewer = await requireViewer();
  const t = await getTranslations("policies");
  const startText = await startTexts();
  const tk = await getTranslations("wizard.documentKinds");
  const agency = viewer.activeMembership?.organization.type === "AGENCY";
  // Audit of 2026-10-30 (B1): an agency also requests quotes for its own
  // customers: two lists, the policies it issued and its customers' ones.
  const mayIssue = can(viewer.actor, "issuance.manage");
  const isAgency = agency && mayIssue && query.vista !== "clienti";
  // The documents through the requester's own routes (the API logs each opening).
  const base = viewer.me.kind === "PRIVATE" ? "/preventivi" : "/richieste";
  const { status, body: rows } = await api<PolicyRow[]>(
    isAgency ? "/agency/policies" : "/policies",
  );
  if (status !== 200) notFound();
  const withdrawals = isAgency
    ? await api<WithdrawalRow[]>("/agency/withdrawals").then((w) =>
        w.status === 200 ? w.body : [],
      )
    : [];

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">
        {isAgency ? t("agencyTitle") : agency ? t("customersTitle") : t("title")}
      </h1>
      {agency && mayIssue ? (
        <nav aria-label={t("views")} className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href="/polizze"
            aria-current={isAgency ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 ${isAgency ? "bg-night-900 text-white" : "bg-warm-100"}`}
          >
            {t("agencyTitle")}
          </Link>
          <Link
            href="/polizze?vista=clienti"
            aria-current={isAgency ? undefined : "page"}
            className={`rounded-full px-3 py-1.5 ${isAgency ? "bg-warm-100" : "bg-night-900 text-white"}`}
          >
            {t("customersTitle")}
          </Link>
        </nav>
      ) : null}
      <ErrorSummary codes={query.errore} />
      {query.recesso || query.prezzato ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {query.recesso ? t("withdrawalAsked") : t("withdrawalPriced")}
        </p>
      ) : null}
      {withdrawals.filter((w) => w.status === "REQUESTED").length > 0 ? (
        <Card className="mt-6">
          <h2 className="font-semibold">{t("withdrawalsTitle")}</h2>
          <ul className="mt-2 divide-y divide-warm-200 text-sm">
            {withdrawals
              .filter((w) => w.status === "REQUESTED")
              .map((w) => (
                <li key={w.id} className="py-3">
                  <section aria-label={w.policyNumber}>
                    <p>
                      {w.code} · {t("number", { number: w.policyNumber })} · {t("premium")}{" "}
                      <span className="tabular">{formatEuroCents(w.premiumCents)}</span>
                    </p>
                    <form action={priceWithdrawal} className="mt-2 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="withdrawalId" value={w.id} />
                      <label className="grid gap-1">
                        {t("refundable")}
                        <input
                          name="refundable"
                          required
                          inputMode="decimal"
                          className="rounded-lg border border-warm-200 px-3 py-2"
                        />
                      </label>
                      <Button type="submit" size="sm">
                        {t("price")}
                      </Button>
                    </form>
                  </section>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
      {rows.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((p) => (
            <li key={p.id}>
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">
                    {p.company} · {t("number", { number: p.policyNumber })}
                  </h2>
                  <Badge tone={TONE[p.status] ?? "neutral"}>{t(`status.${p.status}`)}</Badge>
                </div>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt className="text-warm-600">{t("holder")}</dt>
                  <dd>{p.holder}</dd>
                  <dt className="text-warm-600">{t("plate")}</dt>
                  <dd>{p.plate}</dd>
                  <dt className="text-warm-600">{t("period")}</dt>
                  <dd>
                    {startText({ startDate: p.startDate, startsAt: p.startsAt })} –{" "}
                    {formatDate(p.endDate)}
                  </dd>
                  <dt className="text-warm-600">{t("premium")}</dt>
                  <dd className="tabular">{formatEuroCents(p.premiumCents)}</dd>
                  {p.agency ? (
                    <>
                      <dt className="text-warm-600">{t("agency")}</dt>
                      <dd>
                        {p.agency.name}
                        {p.agency.pec ? ` · ${p.agency.pec}` : ""}
                      </dd>
                    </>
                  ) : null}
                </dl>
                {!isAgency && p.renewalRequestId ? (
                  <p className="mt-3 text-sm">
                    <a className="underline" href={`${base}/${p.renewalRequestId}`}>
                      {t("renewalOpen")}
                    </a>
                  </p>
                ) : !isAgency && p.renewable ? (
                  <form action={renewPolicy} className="mt-3 flex flex-wrap items-center gap-3">
                    <input type="hidden" name="policyId" value={p.id} />
                    <input type="hidden" name="base" value={base} />
                    <Button type="submit" size="sm">
                      {t("renew")}
                    </Button>
                    <span className="text-sm text-warm-600">{t("renewHint")}</span>
                  </form>
                ) : null}
                {!isAgency && p.withdrawal ? (
                  <p className="mt-2 text-sm">{t(`withdrawal.${p.withdrawal}`)}</p>
                ) : !isAgency && p.withdrawable ? (
                  <form action={requestWithdrawal} className="mt-2">
                    <input type="hidden" name="policyId" value={p.id} />
                    <Button type="submit" size="sm" variant="outline">
                      {t("withdraw")}
                    </Button>
                  </form>
                ) : !isAgency && p.withdrawalOutside ? (
                  <p className="mt-2 text-sm text-warm-600">
                    {t("withdrawalOutside", { agency: p.agency?.name ?? "" })}
                  </p>
                ) : null}
                {p.documents && p.requestId ? (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {p.documents.map((d) => (
                      <li key={d.id}>
                        <a
                          href={`${base}/${p.requestId}/documenti/${d.id}`}
                          target="_blank"
                          rel="noopener"
                          className="underline"
                        >
                          {tk.has(d.kind) ? tk(d.kind) : d.kind}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

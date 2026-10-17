import { formatDate, formatEuroCents } from "@astax/shared/format";
import { Badge, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import type { PolicyRow } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

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
export default async function PoliciesPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("policies");
  const tk = await getTranslations("wizard.documentKinds");
  const isAgency = viewer.activeMembership?.organization.type === "AGENCY";
  // The documents through the requester's own routes (the API logs each opening).
  const base = viewer.me.kind === "PRIVATE" ? "/preventivi" : "/richieste";
  const { status, body: rows } = await api<PolicyRow[]>(
    isAgency ? "/agency/policies" : "/policies",
  );
  if (status !== 200) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{isAgency ? t("agencyTitle") : t("title")}</h1>
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
                    {formatDate(p.startDate)} – {formatDate(p.endDate)}
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

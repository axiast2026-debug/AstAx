import { formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { contestPenalty } from "./actions";

interface PenaltyRow {
  id: string;
  code: string | null;
  type: "LATE_ISSUANCE" | "MISSED_ISSUANCE" | "CIRCUMVENTION";
  amountCents: number;
  status: "APPLIED" | "CONTESTED" | "UPHELD" | "CANCELLED";
  appliedAt: string | null;
  contestUntil: string | null;
  contestText: string | null;
  decision: string | null;
}

/**
 * «Contabilità» of the agency (spec 04): the penalties applied, with the
 * reason and the contest within the time (EMI-05). The statement, the
 * remittances and the invoices come with the remittances (phase 6, step 7).
 */
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("accounting");
  const query = await searchParams;
  const { status, body: penalties } = await api<PenaltyRow[]>("/agency/penalties");
  if (status === 403) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ErrorSummary codes={query.errore} />
      {query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("contested")}
        </p>
      ) : null}
      <Card className="mt-6">
        <CardTitle>{t("penaltiesTitle")}</CardTitle>
        {penalties.length === 0 ? (
          <p className="mt-2 text-sm">{t("noPenalties")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {penalties.map((p) => {
              const open = p.status === "APPLIED" && p.contestUntil !== null;
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {t(`type.${p.type}`)}
                      {p.code ? ` · ${p.code}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular font-semibold">
                        {formatEuroCents(p.amountCents)}
                      </span>
                      <Badge tone={p.status === "CANCELLED" ? "neutral" : "warning"}>
                        {t(`status.${p.status}`)}
                      </Badge>
                    </span>
                  </div>
                  {p.appliedAt ? (
                    <p className="text-warm-600">
                      {t("appliedAt", { at: formatDateTime(p.appliedAt) })}
                    </p>
                  ) : null}
                  {p.decision ? (
                    <p className="mt-1">{t("decision", { text: p.decision })}</p>
                  ) : null}
                  {open && p.contestUntil ? (
                    <form action={contestPenalty} className="mt-2 grid gap-2">
                      <input type="hidden" name="penaltyId" value={p.id} />
                      <label className="grid gap-1">
                        {t("contestLabel", { until: formatDateTime(p.contestUntil) })}
                        <textarea
                          name="text"
                          required
                          minLength={3}
                          maxLength={1000}
                          rows={2}
                          className="rounded-lg border border-warm-200 px-3 py-2"
                        />
                      </label>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="justify-self-start"
                      >
                        {t("contest")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}

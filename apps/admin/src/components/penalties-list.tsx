import { formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { applyPenalty, cancelPenalty, decideContest } from "@/app/penali/actions";
import { api } from "@/lib/auth";

interface PenaltyRow {
  id: string;
  agency: string;
  code: string | null;
  type: string;
  amountCents: number;
  status: "PROPOSED" | "APPLIED" | "CONTESTED" | "UPHELD" | "CANCELLED";
  reason: string;
  proposedAt: string;
  contestUntil: string | null;
  contestText: string | null;
  decision: string | null;
}

/**
 * EMI-05, decision 29: the penalties. In «Eccezioni» the back office applies
 * or withdraws the proposed ones; in «Organizzazioni» the administrator
 * decides the contested ones. Simple pages: the full panel is phase 7.
 */
export async function PenaltiesList({
  mode,
  canApply = true,
}: {
  mode: "backOffice" | "admin";
  /** Audit of 2026-10-30 (E1): apply and cancel only with penalty.apply. */
  canApply?: boolean;
}) {
  const t = await getTranslations("penalties");
  const { status, body } = await api<PenaltyRow[]>(
    mode === "admin" ? "/admin/penalties" : "/back-office/penalties",
  );
  if (status !== 200) return null;
  const rows = body.filter((p) =>
    mode === "admin" ? p.status === "CONTESTED" : p.status === "PROPOSED" || p.status === "APPLIED",
  );
  return (
    <Card className="mt-6">
      <CardTitle>{mode === "admin" ? t("contestedTitle") : t("title")}</CardTitle>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm">{t("empty")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-warm-200 text-sm">
          {rows.map((p) => (
            <li key={p.id} className="py-3">
              <section aria-label={`${p.agency} ${p.code ?? ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {p.agency} · {t(`type.${p.type}`)}
                    {p.code ? ` · ${p.code}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular font-semibold">{formatEuroCents(p.amountCents)}</span>
                    <Badge tone="warning">{t(`status.${p.status}`)}</Badge>
                  </span>
                </div>
                <p className="text-warm-600">
                  {p.reason} · {formatDateTime(p.proposedAt)}
                </p>
                {p.contestText ? (
                  <p className="mt-1">{t("contestText", { text: p.contestText })}</p>
                ) : null}
                {mode === "backOffice" && !canApply ? null : mode === "backOffice" ? (
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    {p.status === "PROPOSED" ? (
                      <form action={applyPenalty}>
                        <input type="hidden" name="id" value={p.id} />
                        <Button type="submit" size="sm">
                          {t("apply")}
                        </Button>
                      </form>
                    ) : null}
                    <form action={cancelPenalty} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <label className="grid gap-1">
                        {t("reason")}
                        <input
                          name="reason"
                          required
                          minLength={3}
                          className="rounded-lg border border-warm-200 px-3 py-2"
                        />
                      </label>
                      <Button type="submit" size="sm" variant="outline">
                        {t("cancel")}
                      </Button>
                    </form>
                  </div>
                ) : (
                  <form action={decideContest} className="mt-2 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={p.id} />
                    <label className="flex items-center gap-2">
                      <input type="radio" name="outcome" value="UPHELD" defaultChecked />
                      {t("uphold")}
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="outcome" value="CANCELLED" />
                      {t("annul")}
                    </label>
                    <label className="grid gap-1">
                      {t("decision")}
                      <input
                        name="decision"
                        required
                        minLength={3}
                        className="rounded-lg border border-warm-200 px-3 py-2"
                      />
                    </label>
                    <Button type="submit" size="sm">
                      {t("decide")}
                    </Button>
                  </form>
                )}
              </section>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

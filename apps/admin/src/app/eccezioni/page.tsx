import { formatDate, formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { decideIssuanceProblem } from "./actions";

interface IssuanceProblem {
  id: string;
  code: string;
  requestStatus: string;
  startDate: string | null;
  agency: string;
  type: "DATA_MISMATCH" | "CANNOT_ISSUE" | "MISSED_DEADLINE";
  description: string | null;
  openedAt: string;
  status: "OPEN" | "DECIDED";
  fault: "AGENCY" | "CUSTOMER" | null;
  decisionReason: string | null;
}

/**
 * «Eccezioni» (spec 06), the missed issuances (EMI-04): the back office
 * decides whose fault it is. The agency's: the penalty of 100 € replaces
 * the one for the delay and the customer gets the second offer. The
 * customer's data: the agency's new price for the customer to confirm.
 */
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("exceptions");
  const query = await searchParams;
  const { status, body } = await api<IssuanceProblem[]>("/back-office/issuance-problems");
  if (status === 403) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("decided")}
        </p>
      ) : null}
      {body.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-4">
          {body.map((p) => (
            <li key={p.id}>
              <Card>
                <section aria-label={p.code}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold">
                      {p.code} · {p.agency}
                    </h2>
                    <Badge tone={p.status === "OPEN" ? "warning" : "neutral"}>
                      {t(`status.${p.status}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm">
                    {t(`type.${p.type}`)} · {formatDateTime(p.openedAt)}
                    {p.startDate ? ` · ${t("start", { date: formatDate(p.startDate) })}` : ""}
                  </p>
                  {p.description ? (
                    <p className="mt-1 text-sm text-warm-600">{p.description}</p>
                  ) : null}
                  {p.status === "DECIDED" ? (
                    <p className="mt-2 text-sm">
                      {t(`fault.${p.fault ?? "AGENCY"}`)}
                      {p.decisionReason ? ` — ${p.decisionReason}` : ""}
                    </p>
                  ) : (
                    <form action={decideIssuanceProblem} className="mt-3 space-y-3 text-sm">
                      <input type="hidden" name="problemId" value={p.id} />
                      <fieldset className="space-y-1">
                        <legend className="font-medium">{t("whose")}</legend>
                        <label className="flex items-center gap-2">
                          <input type="radio" name="fault" value="AGENCY" defaultChecked />
                          {t("fault.AGENCY")}
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="radio" name="fault" value="CUSTOMER" />
                          {t("fault.CUSTOMER")}
                        </label>
                      </fieldset>
                      <label className="grid gap-1">
                        {t("newPremium")}
                        <input
                          name="newPremium"
                          inputMode="decimal"
                          pattern="\d{1,7}([.,]\d{1,2})?"
                          className="max-w-xs rounded-lg border border-warm-200 px-3 py-2"
                        />
                      </label>
                      <label className="grid gap-1">
                        {t("reason")}
                        <input
                          name="reason"
                          required
                          minLength={3}
                          maxLength={500}
                          className="rounded-lg border border-warm-200 px-3 py-2"
                        />
                      </label>
                      <Button type="submit">{t("decide")}</Button>
                    </form>
                  )}
                </section>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

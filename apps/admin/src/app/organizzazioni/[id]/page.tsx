import { formatDate, formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { organizationStep } from "../org-actions";

interface Detail {
  id: string;
  type: "AGENCY" | "BROKER";
  legalName: string;
  ruiNumber: string | null;
  status: string;
  statusReason: string | null;
  profInsuranceExpiresOn: string | null;
  mandates: { company: string; source: string }[];
  suspensions: { reason: string; startedAt: string; revokedAt: string | null }[];
  notes: {
    id: string;
    kind: "NOTE" | "EXCLUSION_PROPOSAL";
    text: string;
    createdAt: string;
    decision: string | null;
    decisionReason: string | null;
  }[];
  history: { action: string; at: string; reason: string | null }[];
}

const STEPS = ["suspend", "reactivate", "NOTE", "EXCLUSION_PROPOSAL"] as const;
const field = "rounded-lg border border-warm-200 px-3 py-2";

/** One agency or broker: mandates, suspensions, notes, decisions; the actions with a reason. */
export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer();
  const t = await getTranslations("organizationsList");
  const query = await searchParams;
  const { status, body: o } = await api<Detail>(`/back-office/organizations/${id}`);
  if (status !== 200) notFound();
  const suspended = o.status === "SUSPENDED" || o.suspensions.some((s) => s.revokedAt === null);
  const done = STEPS.find((s) => s === query.fatto);

  return (
    <AppShell viewer={viewer}>
      <Link href="/organizzazioni" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{o.legalName}</h1>
      <p className="mt-1 text-sm text-warm-600">
        {t(`types.${o.type}`)} {o.ruiNumber ?? ""} ·{" "}
        {suspended && o.status === "ACTIVE" ? t("suspended") : t(`statuses.${o.status}`)}
        {o.statusReason ? ` · ${o.statusReason}` : ""}
      </p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : done ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${done}`)}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("details")}</CardTitle>
          <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-1 text-sm">
            <dt className="text-warm-600">{t("profInsurance")}</dt>
            <dd>{o.profInsuranceExpiresOn ? formatDate(o.profInsuranceExpiresOn) : "—"}</dd>
            {o.type === "AGENCY" ? (
              <>
                <dt className="text-warm-600">{t("mandates")}</dt>
                <dd>
                  {o.mandates.map((m) => `${m.company} (${t(`sources.${m.source}`)})`).join(", ") ||
                    "—"}
                </dd>
              </>
            ) : null}
          </dl>
        </Card>

        {o.status === "EXCLUDED" ? null : (
          <Card>
            <CardTitle>{t("actions")}</CardTitle>
            <form action={organizationStep} className="mt-3 grid gap-3 text-sm">
              <input type="hidden" name="id" value={o.id} />
              <label className="grid gap-1">
                {t("action")}
                <select name="step" className={field}>
                  {suspended ? (
                    <option value="reactivate">{t("steps.reactivate")}</option>
                  ) : (
                    <option value="suspend">{t("steps.suspend")}</option>
                  )}
                  <option value="NOTE">{t("steps.NOTE")}</option>
                  <option value="EXCLUSION_PROPOSAL">{t("steps.EXCLUSION_PROPOSAL")}</option>
                </select>
              </label>
              <label className="grid gap-1">
                {t("text")}
                <textarea name="text" required minLength={3} rows={3} className={field} />
              </label>
              <Button type="submit" size="sm" className="justify-self-start">
                {t("confirm")}
              </Button>
            </form>
          </Card>
        )}

        <Card>
          <CardTitle>{t("notes")}</CardTitle>
          {o.notes.length === 0 ? (
            <p className="mt-2 text-sm text-warm-600">{t("noNotes")}</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {o.notes.map((n) => (
                <li key={n.id}>
                  <span className="text-warm-600">{formatDateTime(n.createdAt)}</span>{" "}
                  {n.kind === "EXCLUSION_PROPOSAL" ? (
                    <Badge tone="danger">{t("steps.EXCLUSION_PROPOSAL")}</Badge>
                  ) : null}{" "}
                  {n.text}
                  {n.decision ? (
                    <span className="block text-warm-600">
                      {t(`decisions.${n.decision}`)}: {n.decisionReason}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>{t("history")}</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {o.suspensions.map((s) => (
              <li key={s.startedAt}>
                {t("suspendedFrom", { at: formatDateTime(s.startedAt) })}
                {s.revokedAt ? ` → ${formatDateTime(s.revokedAt)}` : ""} · {s.reason}
              </li>
            ))}
            {o.history.map((x) => (
              <li key={`${x.action}-${x.at}`}>
                {formatDateTime(x.at)} · {t(`audit.${x.action}`)}
                {x.reason ? ` · ${x.reason}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}

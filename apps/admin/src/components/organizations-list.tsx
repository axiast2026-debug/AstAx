import { formatDate, formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { decideExclusion } from "@/app/organizzazioni/org-actions";
import { api } from "@/lib/auth";

interface Row {
  id: string;
  type: "AGENCY" | "BROKER";
  legalName: string;
  ruiNumber: string | null;
  status: string;
  suspended: boolean;
  exclusionProposed: boolean;
  profInsuranceExpiresOn: string | null;
  invitations: number;
  offers: number;
  wins: number;
  penalties: number;
  openFlags: number;
}

const field = "rounded-lg border border-warm-200 px-3 py-2";

/** Spec 06 «Agenzie e broker»: the list with participation, penalties, flags, documents. */
export async function OrganizationsList({ q, type }: { q?: string; type?: string }) {
  const t = await getTranslations("organizationsList");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type === "AGENCY" || type === "BROKER") params.set("type", type);
  const { status, body } = await api<Row[]>(`/back-office/organizations?${params.toString()}`);
  if (status !== 200) return null;
  return (
    <Card className="mt-6">
      <CardTitle>{t("title")}</CardTitle>
      <form method="get" className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">
          {t("search")}
          <input name="q" defaultValue={q ?? ""} className={field} />
        </label>
        <label className="grid gap-1">
          {t("type")}
          <select name="type" defaultValue={type ?? ""} className={field}>
            <option value="">{t("all")}</option>
            <option value="AGENCY">{t("types.AGENCY")}</option>
            <option value="BROKER">{t("types.BROKER")}</option>
          </select>
        </label>
        <Button type="submit" size="sm">
          {t("find")}
        </Button>
      </form>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-warm-600">
            <tr>
              <th className="py-2 pr-3">{t("name")}</th>
              <th className="py-2 pr-3">{t("status")}</th>
              <th className="py-2 pr-3">{t("participation")}</th>
              <th className="py-2 pr-3">{t("penalties")}</th>
              <th className="py-2 pr-3">{t("flags")}</th>
              <th className="py-2">{t("profInsurance")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-200">
            {body.map((o) => (
              <tr key={o.id}>
                <td className="py-2 pr-3">
                  <Link href={`/organizzazioni/${o.id}`} className="underline">
                    {o.legalName}
                  </Link>
                  <span className="block text-xs text-warm-600">
                    {t(`types.${o.type}`)} {o.ruiNumber ?? ""}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Badge tone={o.status === "ACTIVE" && !o.suspended ? "success" : "danger"}>
                    {o.suspended && o.status === "ACTIVE"
                      ? t("suspended")
                      : t(`statuses.${o.status}`)}
                  </Badge>
                  {o.exclusionProposed ? (
                    <span className="block text-xs text-red-700">{t("exclusionProposed")}</span>
                  ) : null}
                </td>
                <td className="py-2 pr-3">
                  {o.type === "AGENCY"
                    ? t("participationValue", {
                        invitations: o.invitations,
                        offers: o.offers,
                        wins: o.wins,
                      })
                    : "—"}
                </td>
                <td className="py-2 pr-3">{o.penalties}</td>
                <td className="py-2 pr-3">{o.openFlags}</td>
                <td className="py-2">
                  {o.profInsuranceExpiresOn ? formatDate(o.profInsuranceExpiresOn) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface Proposal {
  id: string;
  organizationId: string;
  organization: string;
  text: string;
  createdAt: string;
}

/** Spec 07: the exclusions proposed by the back office, for the administrator. */
export async function ExclusionProposals() {
  const t = await getTranslations("organizationsList");
  const { status, body } = await api<Proposal[]>("/admin/exclusion-proposals");
  if (status !== 200) return null;
  return (
    <Card className="mt-6">
      <CardTitle>{t("proposals")}</CardTitle>
      {body.length === 0 ? (
        <p className="mt-2 text-sm">{t("noProposals")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-warm-200 text-sm">
          {body.map((p) => (
            <li key={p.id} className="py-3">
              <section aria-label={p.organization}>
                <Link
                  href={`/organizzazioni/${p.organizationId}`}
                  className="font-medium underline"
                >
                  {p.organization}
                </Link>
                <p className="text-warm-600">
                  {formatDateTime(p.createdAt)} · {p.text}
                </p>
                <form action={decideExclusion} className="mt-2 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="flex items-center gap-2">
                    <input type="radio" name="outcome" value="accept" required />
                    {t("exclude")}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="outcome" value="reject" />
                    {t("keep")}
                  </label>
                  <label className="grid gap-1">
                    {t("reason")}
                    <input name="reason" required minLength={3} className={field} />
                  </label>
                  <Button type="submit" size="sm">
                    {t("decide")}
                  </Button>
                </form>
              </section>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

import { formatDate, formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { decideOnboarding } from "../actions";

interface Detail {
  id: string;
  type: "AGENCY" | "BROKER";
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  legalName: string;
  vatNumber: string;
  fiscalCode: string | null;
  ruiNumber: string;
  pec: string;
  address: { street: string; postalCode: string; municipalityIstat: string; province: string };
  iban: string;
  ibanConfirmedAt: string | null;
  owner: { firstName: string; lastName: string; email: string; phone: string };
  companies: { id: string; name: string }[];
  profInsurance: { expiresOn: string | null; size: number | null } | null;
  contracts: { title: string; number: number; validated: boolean }[];
  acceptedAt: string | null;
  acceptedIp: string | null;
  ruiCheck: {
    found: boolean;
    sectionMatches: boolean;
    nameMatches: boolean;
    registeredName: string | null;
    confirmedCompanies: string[];
    unconfirmedCompanies: string[];
    importedAt: string | null;
  } | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * One entry: the data, the automatic check on the RUI, the mandates, the
 * professional liability policy, the contracts accepted; approve or reject
 * with a reason. Opening it is in the access log (it holds IBAN and contacts).
 */
export default async function OnboardingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer();
  const t = await getTranslations("onboardingQueue");
  const locale = (await getLocale()) === "sq" ? "sq" : "it";
  const query = await searchParams;
  const { status, body: a } = await api<Detail>(`/bo/onboarding/${id}`);
  if (status !== 200) notFound();
  const check = a.ruiCheck;
  const ok = (value: boolean) => (
    <Badge tone={value ? "success" : "danger"}>{value ? t("yes") : t("no")}</Badge>
  );

  return (
    <AppShell viewer={viewer}>
      <Link href="/ingressi" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{a.legalName}</h1>
      <p className="mt-1 text-sm text-warm-600">
        {t(`types.${a.type}`)} · {t(`status.${a.status}`)}
        {a.submittedAt ? ` · ${t("sentAt", { at: formatDateTime(a.submittedAt, locale) })}` : ""}
      </p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("ruiCheck")}</CardTitle>
          {check ? (
            <dl className="mt-3 grid grid-cols-[12rem_1fr] gap-2 text-sm">
              <dt>{t("ruiFoundLabel")}</dt>
              <dd>{ok(check.found)}</dd>
              <dt>{t("sectionMatches")}</dt>
              <dd>{ok(check.sectionMatches)}</dd>
              <dt>{t("nameMatches")}</dt>
              <dd>
                {ok(check.nameMatches)} {check.registeredName ? `(${check.registeredName})` : ""}
              </dd>
              {a.type === "AGENCY" ? (
                <>
                  <dt>{t("confirmedCompanies")}</dt>
                  <dd>{check.confirmedCompanies.join(", ") || "—"}</dd>
                  <dt>{t("unconfirmedCompanies")}</dt>
                  <dd>{check.unconfirmedCompanies.join(", ") || "—"}</dd>
                </>
              ) : null}
              <dt>{t("ruiImportedAt")}</dt>
              <dd>{check.importedAt ? formatDateTime(check.importedAt, locale) : "—"}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-warm-600">{t("notSent")}</p>
          )}
        </Card>

        <Card>
          <CardTitle>{t("data")}</CardTitle>
          <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-1 text-sm">
            <dt className="text-warm-600">{t("ruiLabel")}</dt>
            <dd>{a.ruiNumber}</dd>
            <dt className="text-warm-600">{t("vatNumber")}</dt>
            <dd>{a.vatNumber}</dd>
            {a.fiscalCode ? (
              <>
                <dt className="text-warm-600">{t("fiscalCode")}</dt>
                <dd>{a.fiscalCode}</dd>
              </>
            ) : null}
            <dt className="text-warm-600">{t("pec")}</dt>
            <dd>{a.pec}</dd>
            <dt className="text-warm-600">{t("address")}</dt>
            <dd>
              {a.address.street}, {a.address.postalCode} ({a.address.province}) ·{" "}
              {t("istat", { code: a.address.municipalityIstat })}
            </dd>
            <dt className="text-warm-600">{t("owner")}</dt>
            <dd>
              {a.owner.firstName} {a.owner.lastName} · {a.owner.email} · {a.owner.phone}
            </dd>
            <dt className="text-warm-600">{t("iban")}</dt>
            <dd>
              {a.iban}{" "}
              {a.ibanConfirmedAt ? (
                <Badge tone="success">{t("ibanConfirmed")}</Badge>
              ) : (
                <Badge tone="danger">{t("ibanNotConfirmed")}</Badge>
              )}
            </dd>
            {a.type === "AGENCY" ? (
              <>
                <dt className="text-warm-600">{t("mandates")}</dt>
                <dd>{a.companies.map((c) => c.name).join(", ")}</dd>
              </>
            ) : null}
          </dl>
        </Card>

        <Card>
          <CardTitle>{t("profInsurance")}</CardTitle>
          {a.profInsurance ? (
            <p className="mt-2 text-sm">
              {t("expiresOn", {
                date: a.profInsurance.expiresOn
                  ? formatDate(a.profInsurance.expiresOn, locale)
                  : "—",
              })}{" "}
              <a href={`/ingressi/${a.id}/polizza`} className="underline">
                {t("open")}
              </a>
            </p>
          ) : (
            <p className="mt-2 text-sm text-warm-600">{t("missing")}</p>
          )}
        </Card>

        <Card>
          <CardTitle>{t("contracts")}</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {a.contracts.map((c) => (
              <li key={`${c.title}-${c.number}`}>
                {c.title} · {t("version", { number: c.number })}
                {c.validated ? "" : ` · ${t("placeholder")}`}
              </li>
            ))}
          </ul>
          {a.acceptedAt ? (
            <p className="mt-2 text-sm text-warm-600">
              {t("acceptedAt", {
                at: formatDateTime(a.acceptedAt, locale),
                ip: a.acceptedIp ?? "—",
              })}
            </p>
          ) : null}
        </Card>
      </div>

      {a.status === "SUBMITTED" ? (
        <Card className="mt-6">
          <CardTitle>{t("decision")}</CardTitle>
          <form action={decideOnboarding} className="mt-3 grid gap-3 text-sm">
            <input type="hidden" name="id" value={a.id} />
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2">
                <input type="radio" name="outcome" value="approve" required />
                {t("approve")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="outcome" value="reject" />
                {t("reject")}
              </label>
            </div>
            <label className="grid gap-1">
              {t("reason")}
              <textarea name="reason" required minLength={3} rows={3} className={field} />
            </label>
            <Button type="submit" className="justify-self-start">
              {t("confirm")}
            </Button>
          </form>
        </Card>
      ) : a.decidedAt ? (
        <Card className="mt-6">
          <CardTitle>{t("decision")}</CardTitle>
          <p className="mt-2 text-sm">
            {t("decidedAt", { at: formatDateTime(a.decidedAt, locale) })}: {a.decisionReason}
          </p>
        </Card>
      ) : null}
    </AppShell>
  );
}

import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Countdown } from "@/components/countdown";
import { ErrorSummary, Field } from "@/components/form";
import type { IssuanceDetail } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { markIssued, reportIssuanceProblem, uploadIssuanceDocument } from "../actions";

/**
 * «Da emettere», detail (spec 04, EMI-01, EMI-02): all the data with the
 * customer's contacts (only after the payment, VIS-02), the signed documents
 * and the payment receipt; the upload of policy, receipt and certificate,
 * «Segna come emessa», and the report of a problem to the back office.
 */
export default async function IssuancePage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ errore?: string; fatto?: string; caricato?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const { requestId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) notFound();
  const query = await searchParams;
  const t = await getTranslations("issuance");
  const tk = await getTranslations("wizard.documentKinds");
  const { status, body: d } = await api<IssuanceDetail>(`/agency/issuance/${requestId}`);
  if (status !== 200) notFound();
  const docHref = (id: string) => `/da-emettere/${requestId}/documenti/${id}`;
  const open = d.status === "IN_ISSUANCE";
  const allUploaded = d.uploaded.every((u) => u.documentId);

  return (
    <AppShell viewer={viewer}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("title", { code: d.code })}</h1>
          <Link href="/da-emettere" className="text-sm underline">
            {t("back")}
          </Link>
        </div>
        <ErrorSummary codes={query.errore} />
        {query.fatto ? (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm">
            {t(`done.${query.fatto === "emessa" ? "issued" : "reported"}`)}
          </p>
        ) : null}

        <Card>
          <CardTitle>{t("dataTitle")}</CardTitle>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
            <dt className="text-warm-600">{t("holder")}</dt>
            <dd>{d.holder}</dd>
            <dt className="text-warm-600">{t("vehicle")}</dt>
            <dd>{d.vehicle}</dd>
            <dt className="text-warm-600">{t("company")}</dt>
            <dd>
              {d.company} · {d.product}
            </dd>
            <dt className="text-warm-600">{t("premium")}</dt>
            <dd className="tabular">{formatEuroCents(d.premiumCents)}</dd>
            <dt className="text-warm-600">{t("start")}</dt>
            <dd>{d.startDate ? formatDate(d.startDate) : ""}</dd>
            <dt className="text-warm-600">{t("email")}</dt>
            <dd>
              {d.email ? (
                <a href={`mailto:${d.email}`} className="underline">
                  {d.email}
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-warm-600">{t("phone")}</dt>
            <dd>
              {d.phone ? (
                <a href={`tel:${d.phone}`} className="underline">
                  {d.phone}
                </a>
              ) : (
                "—"
              )}
            </dd>
            {open && d.issuanceDeadlineAt ? (
              <>
                <dt className="font-semibold">{t("deadline")}</dt>
                <dd className="font-semibold">
                  {formatDateTime(d.issuanceDeadlineAt)} ·{" "}
                  <Countdown until={d.issuanceDeadlineAt} closedLabel={t("passed")} />
                </dd>
              </>
            ) : null}
          </dl>
        </Card>

        <Card>
          <CardTitle>{t("customerDocuments")}</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {d.signedDocuments.map((doc, i) => (
              <li key={doc.id}>
                <a href={docHref(doc.id)} target="_blank" rel="noopener" className="underline">
                  {t("signedDocument", { n: i + 1 })}
                </a>
              </li>
            ))}
            <li>
              <a href={docHref("receipt")} target="_blank" rel="noopener" className="underline">
                {t("receipt")}
              </a>
            </li>
          </ul>
        </Card>

        {d.policy ? (
          <Card className="border-green-600">
            <CardTitle>{t("issuedTitle")}</CardTitle>
            <p className="mt-2 text-sm">
              {t("issuedText", { number: d.policy.number, at: formatDateTime(d.policy.issuedAt) })}
            </p>
          </Card>
        ) : null}

        <Card>
          <CardTitle>{t("uploadTitle")}</CardTitle>
          <ul className="mt-3 space-y-4 text-sm">
            {d.uploaded.map((u) => (
              <li key={u.kind} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{tk(u.kind)}</span>
                  {u.documentId ? (
                    <>
                      <Badge tone="success">{t("uploaded")}</Badge>
                      <a
                        href={docHref(u.documentId)}
                        target="_blank"
                        rel="noopener"
                        className="underline"
                      >
                        {t("open")}
                      </a>
                    </>
                  ) : (
                    <Badge tone="warning">{t("missing")}</Badge>
                  )}
                </div>
                {open ? (
                  <form action={uploadIssuanceDocument} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="requestId" value={requestId} />
                    <input type="hidden" name="kind" value={u.kind} />
                    <label className="grid gap-1">
                      <span className="sr-only">{t("file", { kind: tk(u.kind) })}</span>
                      <input
                        type="file"
                        name="file"
                        accept="application/pdf"
                        required
                        aria-label={t("file", { kind: tk(u.kind) })}
                      />
                    </label>
                    <Button type="submit" size="sm" variant="outline">
                      {u.documentId ? t("replace") : t("upload")}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {open ? (
            <form action={markIssued} className="mt-6 space-y-3 border-t border-warm-200 pt-4">
              <input type="hidden" name="requestId" value={requestId} />
              <Field
                label={t("policyNumber")}
                name="policyNumber"
                required
                minLength={3}
                maxLength={40}
              />
              <Button type="submit" disabled={!allUploaded}>
                {t("markIssued")}
              </Button>
              {!allUploaded ? <p className="text-sm text-warm-600">{t("uploadFirst")}</p> : null}
            </form>
          ) : null}
        </Card>

        {open ? (
          <Card>
            <CardTitle>{t("problemTitle")}</CardTitle>
            <p className="mt-1 text-sm text-warm-600">{t("problemIntro")}</p>
            <form action={reportIssuanceProblem} className="mt-3 space-y-3 text-sm">
              <input type="hidden" name="requestId" value={requestId} />
              <fieldset className="space-y-1">
                <legend className="sr-only">{t("problemType")}</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="type" value="DATA_MISMATCH" defaultChecked />
                  {t("types.DATA_MISMATCH")}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="type" value="CANNOT_ISSUE" />
                  {t("types.CANNOT_ISSUE")}
                </label>
              </fieldset>
              <label className="grid gap-1">
                {t("description")}
                <textarea
                  name="description"
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={3}
                  className="rounded-lg border border-warm-200 px-3 py-2"
                />
              </label>
              <Button type="submit" variant="outline">
                {t("report")}
              </Button>
            </form>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

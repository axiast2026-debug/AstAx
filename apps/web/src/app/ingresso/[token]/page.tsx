import { formatDate } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorSummary, Field } from "@/components/form";
import { publicApi } from "@/lib/public-api";
import {
  confirmIban,
  sendIbanCode,
  submitOnboarding,
  updateOnboarding,
  uploadProfInsurance,
} from "../actions";
import { OnboardingForm, type OnboardingValues } from "../onboarding-form";

const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;
const DONE = ["creata", "salvata", "iban", "polizza", "inviata"] as const;

interface Application extends OnboardingValues {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  iban: string;
  ibanConfirmed: boolean;
  profInsurance: { expiresOn: string | null } | null;
  rejectionReason: string | null;
  documents: { key: string; title: string; versionId: string; number: number; contentMd: string }[];
}

/**
 * The private link of an entry: the data (with the correction), the IBAN
 * confirmed by SMS, the professional liability policy, the contracts and the
 * sending to the back office. Keep the link: it is the only way back.
 */
export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ codice?: string; errore?: string; fatto?: string; modifica?: string }>;
}) {
  const { token } = await params;
  if (!TOKEN.test(token)) notFound();
  const query = await searchParams;
  const t = await getTranslations("onboarding");
  const [{ status, body: a }, options] = await Promise.all([
    publicApi<Application>(`/onboarding/${token}`),
    publicApi<{ companies: { id: string; name: string }[] }>("/onboarding/options?type=AGENCY"),
  ]);
  if (status !== 200) notFound();
  const editable = a.status === "DRAFT" || a.status === "REJECTED";
  const done = DONE.find((d) => d === query.fatto);
  const ready = a.ibanConfirmed && a.profInsurance !== null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-lg font-bold">{t("brand")}</p>
      <h1 className="mt-4 text-2xl font-bold">{a.legalName}</h1>
      <p className="mt-2">
        <Badge>{t(`status.${a.status}`)}</Badge>
      </p>
      <p className="mt-3 text-sm text-warm-600">{t("keepLink")}</p>
      <div className="mt-6">
        <ErrorSummary codes={query.errore} />
      </div>
      {done ? (
        <p role="status" className="mb-6 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${done}`)}
        </p>
      ) : null}
      {a.status === "REJECTED" && a.rejectionReason ? (
        <Card className="mb-6 border-red-600">
          <CardTitle>{t("rejected")}</CardTitle>
          <p className="mt-2 text-sm">{a.rejectionReason}</p>
        </Card>
      ) : null}
      {a.status === "SUBMITTED" ? (
        <Card>
          <p className="text-sm">{t("waiting")}</p>
        </Card>
      ) : a.status === "APPROVED" ? (
        <Card>
          <p className="text-sm">{t("approved")}</p>
        </Card>
      ) : query.modifica ? (
        <Card>
          <CardTitle>{t("editTitle")}</CardTitle>
          <div className="mt-4">
            <OnboardingForm
              type={a.type}
              companies={options.status === 200 ? options.body.companies : []}
              values={a}
              token={token}
              action={updateOnboarding}
            />
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardTitle>{t("step1")}</CardTitle>
            <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-1 text-sm">
              <dt className="text-warm-600">{t("ruiNumber")}</dt>
              <dd>{a.ruiNumber}</dd>
              <dt className="text-warm-600">{t("vatNumber")}</dt>
              <dd>{a.vatNumber}</dd>
              <dt className="text-warm-600">{t("pec")}</dt>
              <dd>{a.pec}</dd>
              <dt className="text-warm-600">{t("owner")}</dt>
              <dd>
                {a.owner.firstName} {a.owner.lastName} · {a.owner.email} · {a.owner.phone}
              </dd>
              <dt className="text-warm-600">{t("iban")}</dt>
              <dd>{a.iban}</dd>
            </dl>
            {editable ? (
              <Link
                href={`/ingresso/${token}?modifica=1`}
                className="mt-3 inline-block text-sm underline"
              >
                {t("edit")}
              </Link>
            ) : null}
          </Card>

          <Card>
            <CardTitle>{t("step2")}</CardTitle>
            {a.ibanConfirmed ? (
              <p className="mt-2 text-sm">{t("ibanConfirmed")}</p>
            ) : (
              <>
                <p className="mt-2 text-sm">{t("ibanCodeIntro", { phone: a.owner.phone })}</p>
                <form action={sendIbanCode} className="mt-3">
                  <input type="hidden" name="token" value={token} />
                  <Button type="submit" variant={query.codice ? "outline" : "primary"}>
                    {query.codice ? t("sendAgain") : t("sendCode")}
                  </Button>
                </form>
                {query.codice ? (
                  <form action={confirmIban} className="mt-4 space-y-3">
                    <input type="hidden" name="token" value={token} />
                    <Field
                      label={t("code")}
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      required
                    />
                    <Button type="submit">{t("confirm")}</Button>
                  </form>
                ) : null}
              </>
            )}
          </Card>

          <Card>
            <CardTitle>{t("step3")}</CardTitle>
            {a.profInsurance ? (
              <p className="mt-2 text-sm">
                {t("policyUploaded", {
                  date: a.profInsurance.expiresOn ? formatDate(a.profInsurance.expiresOn) : "—",
                })}
              </p>
            ) : null}
            <form action={uploadProfInsurance} className="mt-3 space-y-3">
              <input type="hidden" name="token" value={token} />
              <div>
                <label htmlFor="file" className="block text-sm font-medium">
                  {t("policyFile")}
                </label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept="application/pdf"
                  required
                  className="mt-1 text-sm"
                />
              </div>
              <Field label={t("policyExpiry")} name="expiresOn" type="date" required />
              <Button type="submit" variant="outline">
                {t(a.profInsurance ? "replacePolicy" : "uploadPolicy")}
              </Button>
            </form>
          </Card>

          <Card>
            <CardTitle>{t("step4")}</CardTitle>
            <p className="mt-2 text-sm">{t("contractsIntro")}</p>
            <form action={submitOnboarding} className="mt-3 space-y-4">
              <input type="hidden" name="token" value={token} />
              {a.documents.map((d) => (
                <div key={d.versionId} className="rounded-lg border border-warm-200 p-3 text-sm">
                  <input type="hidden" name="required" value={d.versionId} />
                  <details>
                    <summary className="cursor-pointer font-medium">
                      {d.title} · {t("version", { number: d.number })}
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans">
                      {d.contentMd}
                    </pre>
                  </details>
                  <label className="mt-2 flex items-center gap-2">
                    <input type="checkbox" name="versionIds" value={d.versionId} required />
                    {t("accept", { title: d.title })}
                  </label>
                </div>
              ))}
              {ready ? null : <p className="text-sm text-warm-600">{t("notReady")}</p>}
              <Button type="submit" disabled={!ready}>
                {t("submit")}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </main>
  );
}

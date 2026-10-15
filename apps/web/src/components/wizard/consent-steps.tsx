import { formatDateTime } from "@astax/shared/format";
import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import {
  confirmConsent,
  sendConsentCode,
  sendConsentLink,
  uploadConsent,
} from "@/app/request-actions";
import { Field } from "@/components/form";
import { api } from "@/lib/auth";
import type { RequestDetail } from "@/lib/requests";

interface ConsentStatus {
  text: { title: string; contentMd: string; validated: boolean };
  consent: { method: string; acceptedAt: string } | null;
  pendingLink: { expiresAt: string } | null;
}

async function consentStatus(id: string): Promise<ConsentStatus> {
  return (await api<ConsentStatus>(`/requests/${id}/consent`)).body;
}

/** The text of the consent, with the legal marker while it is not validated (rule 10). */
async function ConsentText({ status }: { status: ConsentStatus }) {
  const t = await getTranslations("legal");
  return (
    <section
      aria-labelledby="consent-title"
      className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6"
    >
      <h2 id="consent-title" className="text-base font-semibold">
        {status.text.title}
      </h2>
      {status.text.validated ? null : (
        <p className="mt-2 text-sm font-semibold text-red-700">{t("notValidated")}</p>
      )}
      <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-line text-sm text-night-900">
        {status.text.contentMd}
      </div>
    </section>
  );
}

/** Step 5 of the private wizard: consents confirmed with a code (spec 03; LEG-04). */
export async function PrivateConsentStep({
  detail,
  codeSent,
}: {
  detail: RequestDetail;
  codeSent: boolean;
}) {
  const t = await getTranslations("wizard.consent");
  const status = await consentStatus(detail.id);
  return (
    <div className="space-y-6">
      <ConsentText status={status} />
      {status.consent ? (
        <p role="status" className="rounded-xl bg-green-50 p-4 text-sm">
          {t("given", { at: formatDateTime(status.consent.acceptedAt) })}
        </p>
      ) : (
        <>
          <form
            action={sendConsentCode}
            className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6"
          >
            <input type="hidden" name="requestId" value={detail.id} />
            <p className="text-sm">{t("codeIntro")}</p>
            <Button type="submit" variant="secondary" className="mt-3">
              {codeSent ? t("sendAgain") : t("sendCode")}
            </Button>
          </form>
          {codeSent ? (
            <form
              action={confirmConsent}
              className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6"
            >
              <input type="hidden" name="requestId" value={detail.id} />
              <p role="status" className="text-sm">
                {t("codeSent")}
              </p>
              <Field
                label={t("code")}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="mt-3 max-w-xs"
                required
              />
              <Button type="submit" className="mt-3">
                {t("confirm")}
              </Button>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Step 5 of the broker wizard: link to the customer, or the consent already collected. */
export async function BrokerConsentStep({
  detail,
  linkSent,
}: {
  detail: RequestDetail;
  linkSent: boolean;
}) {
  const t = await getTranslations("wizard.brokerConsent");
  const status = await consentStatus(detail.id);
  return (
    <div className="space-y-6">
      <ConsentText status={status} />
      {status.consent ? (
        <p role="status" className="rounded-xl bg-green-50 p-4 text-sm">
          {t("given", {
            at: formatDateTime(status.consent.acceptedAt),
            method: t(`method.${status.consent.method}`),
          })}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            action={sendConsentLink}
            className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6"
          >
            <input type="hidden" name="requestId" value={detail.id} />
            <h2 className="text-base font-semibold">{t("linkTitle")}</h2>
            <p className="mt-1 text-sm text-warm-600">{t("linkIntro")}</p>
            {status.pendingLink ? (
              <p role="status" className="mt-3 text-sm">
                {t("linkPending", { at: formatDateTime(status.pendingLink.expiresAt) })}
              </p>
            ) : null}
            {linkSent ? (
              <p role="status" className="mt-3 text-sm font-medium">
                {t("linkSent")}
              </p>
            ) : null}
            <Button type="submit" variant="secondary" className="mt-3">
              {status.pendingLink ? t("sendAgain") : t("sendLink")}
            </Button>
          </form>
          <form
            action={uploadConsent}
            className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6"
          >
            <input type="hidden" name="requestId" value={detail.id} />
            <h2 className="text-base font-semibold">{t("uploadTitle")}</h2>
            <p className="mt-1 text-sm text-warm-600">{t("uploadIntro")}</p>
            <label htmlFor="consent-file" className="mt-3 block text-sm font-medium">
              {t("file")}
            </label>
            <input
              id="consent-file"
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
              className="mt-1 block text-sm"
            />
            <Button type="submit" variant="secondary" className="mt-3">
              {t("upload")}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

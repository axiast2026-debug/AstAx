import { formatDateTime } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ErrorSummary, Field } from "@/components/form";
import { publicApi } from "@/lib/public-api";
import { confirmLink, sendLinkCode } from "../actions";

interface LinkSummary {
  status: "SENT" | "COMPLETED" | "EXPIRED" | "REVOKED";
  broker: string;
  vehicle: string;
  expiresAt: string;
  text: { title: string; contentMd: string; validated: boolean };
}

/**
 * The page the broker's customer opens from the email or SMS
 * (consent.signature_request): who asks, for which vehicle, the text, and the
 * confirmation with a code. No account and no contacts on the page.
 */
export default async function ConsentLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ codice?: string; errore?: string; fatto?: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) notFound();
  const query = await searchParams;
  const t = await getTranslations("consentLink");
  const tl = await getTranslations("legal");
  const { status, body: link } = await publicApi<LinkSummary>(`/consent-links/${token}`);
  if (status === 404) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-lg font-bold">{t("brand")}</p>
      <h1 className="mt-4 text-2xl font-bold">{t("title", { broker: link.broker })}</h1>
      <p className="mt-2 text-sm text-warm-600">{t("intro", { vehicle: link.vehicle })}</p>
      <div className="mt-6">
        <ErrorSummary codes={query.errore} />
      </div>
      {link.status === "COMPLETED" || query.fatto === "1" ? (
        <Card className="mt-6">
          <CardTitle>{t("doneTitle")}</CardTitle>
          <p className="mt-2 text-sm">{t("doneText", { broker: link.broker })}</p>
        </Card>
      ) : link.status !== "SENT" ? (
        <Card className="mt-6">
          <CardTitle>{t("expiredTitle")}</CardTitle>
          <p className="mt-2 text-sm">{t("expiredText", { broker: link.broker })}</p>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          <section
            aria-labelledby="text-title"
            className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6"
          >
            <h2 id="text-title" className="text-base font-semibold">
              {link.text.title}
            </h2>
            {link.text.validated ? null : (
              <p className="mt-2 text-sm font-semibold text-red-700">{tl("notValidated")}</p>
            )}
            <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-line text-sm">
              {link.text.contentMd}
            </div>
          </section>
          <p className="text-sm text-warm-600">
            {t("expires", { at: formatDateTime(link.expiresAt) })}
          </p>
          <form action={sendLinkCode}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="secondary">
              {query.codice === "inviato" ? t("sendAgain") : t("sendCode")}
            </Button>
          </form>
          {query.codice === "inviato" ? (
            <form
              action={confirmLink}
              className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6"
            >
              <input type="hidden" name="token" value={token} />
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
        </div>
      )}
    </main>
  );
}

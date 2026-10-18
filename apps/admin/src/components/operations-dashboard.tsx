import { formatDateTime } from "@astax/shared/format";
import { Card, CardTitle } from "@astax/ui";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { api } from "@/lib/auth";

interface Overview {
  at: string;
  queues: { key: string; count: number; since: string | null; link: string }[];
  indicators: {
    verificationsToday: number;
    averageVerificationMinutes: number | null;
    automaticShare: number | null;
    desertedToday: number | null;
  };
}

const HOUR_MS = 3_600_000;

/** Spec 06 «Dashboard operativa»: the queues of the role, with counter and longest wait. */
export async function OperationsDashboard() {
  const t = await getTranslations("operations");
  const locale = (await getLocale()) === "sq" ? "sq" : "it";
  const { status, body } = await api<Overview>("/back-office/dashboard");
  if (status !== 200) return null;
  const now = new Date(body.at).getTime();
  const wait = (since: string) => {
    const hours = Math.max(0, Math.round((now - new Date(since).getTime()) / HOUR_MS));
    return hours < 1 ? t("lessThanHour") : t("hours", { count: hours });
  };
  return (
    <>
      <h2 className="mt-6 text-xl font-semibold">{t("queues")}</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {body.queues.map((q) => (
          <Card key={q.key}>
            <CardTitle>
              <Link href={q.link} className="underline">
                {t(`queue.${q.key}`)}
              </Link>
            </CardTitle>
            <p className="mt-2 text-3xl font-bold">{q.count}</p>
            <p className="text-sm text-warm-600">
              {q.count === 0 || !q.since
                ? t("nothingWaiting")
                : q.key === "openAuctions"
                  ? t("nextClosing", { at: formatDateTime(q.since, locale) })
                  : ["dataRequests", "tickets", "complaints"].includes(q.key)
                    ? t("nextDue", { at: formatDateTime(q.since, locale) })
                    : t("longestWait", { wait: wait(q.since) })}
            </p>
          </Card>
        ))}
      </div>
      <h2 className="mt-8 text-xl font-semibold">{t("today")}</h2>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[18rem_1fr]">
        <dt>{t("verificationsToday")}</dt>
        <dd>{body.indicators.verificationsToday}</dd>
        <dt>{t("averageVerification")}</dt>
        <dd>
          {body.indicators.averageVerificationMinutes === null
            ? "—"
            : t("minutes", { count: body.indicators.averageVerificationMinutes })}
        </dd>
        <dt>{t("automaticShare")}</dt>
        <dd>
          {body.indicators.automaticShare === null
            ? "—"
            : t("percent", { value: Math.round(body.indicators.automaticShare * 100) })}
        </dd>
        {body.indicators.desertedToday === null ? null : (
          <>
            <dt>{t("desertedToday")}</dt>
            <dd>{body.indicators.desertedToday}</dd>
          </>
        )}
      </dl>
    </>
  );
}

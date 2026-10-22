import { formatDateTime } from "@astax/shared/format";
import { cn } from "@astax/ui";
import { getTranslations } from "next-intl/server";
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

/** Queues whose «since» is a deadline ahead, not a wait. */
const AHEAD = new Set(["openAuctions", "dataRequests", "tickets", "complaints"]);

/**
 * Spec 06 «Dashboard operativa» (back office of the design): the queues of
 * the role as cards with the counter in Inter Tight and the longest wait;
 * the queue waiting the longest has a 2 px border. Nothing moves.
 */
export async function OperationsDashboard() {
  const t = await getTranslations("operations");
  const { status, body } = await api<Overview>("/back-office/dashboard");
  if (status !== 200) return null;
  const now = new Date(body.at).getTime();
  const wait = (since: string) => {
    const hours = Math.max(0, Math.round((now - new Date(since).getTime()) / HOUR_MS));
    return hours < 1 ? t("lessThanHour") : t("hours", { count: hours });
  };
  const urgent = body.queues
    .filter((q) => q.count > 0 && q.since && !AHEAD.has(q.key))
    .sort((a, b) => Date.parse(a.since ?? "") - Date.parse(b.since ?? ""))[0]?.key;
  return (
    <>
      <h2 className="mt-8 text-section font-bold">{t("queues")}</h2>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {body.queues.map((q) => (
          <li
            key={q.key}
            className={cn(
              "flex flex-col gap-1 rounded-xl bg-white p-5",
              q.key === urgent
                ? "shadow-[inset_0_0_0_2px_var(--color-night-900)]"
                : "shadow-[inset_0_0_0_1px_var(--color-warm-200)]",
            )}
          >
            <Link href={q.link} className="text-body font-bold underline underline-offset-2">
              {t(`queue.${q.key}`)}
            </Link>
            {q.key === urgent ? (
              <span className="text-note font-semibold text-orange-700">{t("mostUrgent")}</span>
            ) : null}
            <p className="font-display text-price font-extrabold tabular">{q.count}</p>
            <p className="text-table text-warm-600">
              {q.count === 0 || !q.since
                ? t("nothingWaiting")
                : q.key === "openAuctions"
                  ? t("nextClosing", { at: formatDateTime(q.since) })
                  : ["dataRequests", "tickets", "complaints"].includes(q.key)
                    ? t("nextDue", { at: formatDateTime(q.since) })
                    : t("longestWait", { wait: wait(q.since) })}
            </p>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-section font-bold">{t("today")}</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicator label={t("verificationsToday")} value={body.indicators.verificationsToday} />
        <Indicator
          label={t("averageVerification")}
          value={
            body.indicators.averageVerificationMinutes === null
              ? "—"
              : t("minutes", { count: body.indicators.averageVerificationMinutes })
          }
        />
        <Indicator
          label={t("automaticShare")}
          value={
            body.indicators.automaticShare === null
              ? "—"
              : t("percent", { value: Math.round(body.indicators.automaticShare * 100) })
          }
        />
        {body.indicators.desertedToday === null ? null : (
          <Indicator label={t("desertedToday")} value={body.indicators.desertedToday} />
        )}
      </dl>
    </>
  );
}

function Indicator({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
      <dt className="text-table text-warm-600">{label}</dt>
      <dd className="font-display text-section font-extrabold tabular">{value}</dd>
    </div>
  );
}

import { formatDateTime } from "@astax/shared/format";
import { Badge, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface Row {
  id: string;
  type: "AGENCY" | "BROKER";
  status: string;
  legalName: string;
  ruiNumber: string;
  submittedAt: string | null;
  ruiFound: boolean | null;
}

const STATUSES = ["SUBMITTED", "APPROVED", "REJECTED", "DRAFT"] as const;

/** Spec 06 «Coda di ingresso»: agencies and brokers waiting, the oldest first. */
export default async function OnboardingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("onboardingQueue");
  const query = await searchParams;
  const status = STATUSES.find((s) => s === query.stato) ?? "SUBMITTED";
  const { status: code, body } = await api<Row[]>(`/back-office/onboarding?status=${status}`);
  if (code !== 200) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.fatto === "approve" || query.fatto === "reject" ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${query.fatto}`)}
        </p>
      ) : null}
      <nav aria-label={t("filter")} className="mt-4 flex flex-wrap gap-4 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/ingressi?stato=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={s === status ? "font-semibold underline" : "underline"}
          >
            {t(`status.${s}`)}
          </Link>
        ))}
      </nav>
      {body.length === 0 ? (
        <p className="mt-6 text-sm text-warm-600">{t("empty")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {body.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/ingressi/${r.id}`} className="font-semibold underline">
                  {r.legalName}
                </Link>
                {r.ruiFound === null ? null : (
                  <Badge tone={r.ruiFound ? "success" : "danger"}>
                    {r.ruiFound ? t("ruiFound") : t("ruiMissing")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-warm-600">
                {t(`types.${r.type}`)} · {t("rui", { number: r.ruiNumber })}
                {r.submittedAt ? ` · ${t("sentAt", { at: formatDateTime(r.submittedAt) })}` : ""}
              </p>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

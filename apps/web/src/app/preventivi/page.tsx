import { formatDateTime } from "@astax/shared/format";
import { Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createPrivateRequest } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary } from "@/components/form";
import { StatusBadge } from "@/components/request-view";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import type { RequestSummary } from "@/lib/requests";

/** The private customer's requests (spec 03 «Preventivi»). */
export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("quotes");
  const { body: requests } = await api<RequestSummary[]>("/requests");
  const { errore } = await searchParams;
  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <form action={createPrivateRequest}>
          <Button type="submit">{t("new")}</Button>
        </form>
      </div>
      <div className="mt-6">
        <ErrorSummary codes={errore} />
      </div>
      {requests.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/preventivi/${r.id}`}
                className="block rounded-xl border border-warm-200 bg-white p-4 hover:border-orange-500"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{r.plate ?? t("noPlate")}</span>
                  <StatusBadge status={r.status} />
                  <span className="text-sm text-warm-600">{r.code}</span>
                </div>
                <p className="mt-1 text-sm text-warm-600">
                  {t("created", { at: formatDateTime(r.createdAt) })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

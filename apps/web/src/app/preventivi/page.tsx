import { formatDateTime } from "@astax/shared/format";
import { Button, Icon } from "@astax/ui";
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
        <h1 className="font-display text-screen font-extrabold">{t("title")}</h1>
        {/* With no request the empty state has the button: one, not two. */}
        {requests.length === 0 ? null : (
          <form action={createPrivateRequest}>
            <Button type="submit">{t("new")}</Button>
          </form>
        )}
      </div>
      <div className="mt-6">
        <ErrorSummary codes={errore} />
      </div>
      {requests.length === 0 ? (
        // Primo giorno of the design: what a request needs and the way to start it.
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-white px-4 py-10 text-center shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
          <span
            aria-hidden
            className="inline-flex size-14 items-center justify-center rounded-2xl bg-warm-100 text-night-900"
          >
            <Icon name="camera" size={28} />
          </span>
          <h2 className="text-section font-bold">{t("emptyTitle")}</h2>
          <p className="max-w-md text-table text-warm-800">{t("emptyText")}</p>
          <form action={createPrivateRequest}>
            <Button type="submit" size="lg">
              {t("new")}
            </Button>
          </form>
        </div>
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

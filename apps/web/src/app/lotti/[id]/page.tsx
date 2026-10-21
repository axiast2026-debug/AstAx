import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RequestsTable } from "@/components/requests-table";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import type { RequestSummary } from "@/lib/requests";

/** One lot (ADR 0014): its requests in the work table, with the day each one leaves. */
export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ caricate?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("batches");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const query = await searchParams;
  const [{ body: requests }, { body: batches }] = await Promise.all([
    api<RequestSummary[]>("/requests/search", {
      method: "POST",
      body: JSON.stringify({ batchId: id }),
    }),
    api<{ id: string; code: string }[]>("/broker/batches"),
  ]);
  const batch = batches.find((b) => b.id === id);
  if (!batch) notFound();
  const loaded = Number(query.caricate);

  return (
    <AppShell viewer={viewer}>
      <Link href="/lotti" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{t("detailTitle", { code: batch.code })}</h1>
      {loaded > 0 ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {t("loaded", { count: loaded })}
        </p>
      ) : null}
      <RequestsTable requests={requests} caption={t("detailTitle", { code: batch.code })} />
    </AppShell>
  );
}

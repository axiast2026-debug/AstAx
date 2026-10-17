import { formatEuroCents } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { confirmAiComparison } from "@/app/acceptance-actions";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary } from "@/components/form";
import type { Presentation } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

/**
 * PRES-06, FEE-01: before the comparison the customer sees the fee going up
 * (30 → 35 € by default, both from the parameters) and confirms.
 */
export default async function AiComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.me.kind !== "PRIVATE") notFound();
  const { id } = await params;
  const query = await searchParams;
  const t = await getTranslations("aiCompare");
  const { status, body } = await api<Presentation>(`/requests/${id}/presentation`);
  if (status !== 200) notFound();
  if (body.aiUsed) redirect(`/preventivi/${id}#offerte`);
  const row = body.offers.find((o) => !o.block);
  if (!row || row.feeWithAiCents === null) redirect(`/preventivi/${id}`);
  return (
    <AppShell viewer={viewer}>
      <ErrorSummary codes={query.errore} />
      <Card>
        <CardTitle>{t("title")}</CardTitle>
        <p className="mt-2 text-sm">
          {t("text", {
            from: formatEuroCents(row.feeCents),
            to: formatEuroCents(row.feeWithAiCents),
          })}
        </p>
        <form action={confirmAiComparison} className="mt-4 flex flex-wrap items-center gap-4">
          <input type="hidden" name="requestId" value={id} />
          <Button type="submit">{t("confirm")}</Button>
          <Link href={`/preventivi/${id}#offerte`} className="text-sm underline">
            {t("back")}
          </Link>
        </form>
      </Card>
    </AppShell>
  );
}

import { Badge, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/me";

/**
 * «Flotte aziendali» (Dan, 2026-10-21, docs/piano-broker.md F): announced as
 * «In arrivo»; the requests for a company's vehicles come later.
 */
export default async function FleetsPage() {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "BROKER") notFound();
  const t = await getTranslations("fleets");
  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Badge tone="warning">{t("comingSoon")}</Badge>
      </div>
      <Card className="mt-6 max-w-2xl">
        <p className="text-sm">{t("text")}</p>
        <p className="mt-2 text-sm text-warm-600">{t("meanwhile")}</p>
      </Card>
    </AppShell>
  );
}

import { menuFor } from "@astax/ui";
import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/me";

/**
 * Menu sections that arrive in later phases: an empty page, only for the items
 * of the user's own menu (everything else is 404).
 */
export default async function SectionPage({ params }: { params: Promise<{ section: string[] }> }) {
  const viewer = await requireViewer();
  const href = `/${(await params).section.join("/")}`;
  const entry =
    menuFor(viewer.actor).find((m) => m.href === href) ??
    (href === "/assistenza" ? { key: "support" } : null);
  if (!entry) notFound();
  const t = await getTranslations();
  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t(`menu.${entry.key}`)}</h1>
      <Card className="mt-6">
        <CardTitle>{t("comingSoon.title")}</CardTitle>
        <p className="mt-2 text-sm text-warm-600">{t("comingSoon.text")}</p>
      </Card>
    </AppShell>
  );
}

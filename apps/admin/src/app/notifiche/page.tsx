import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/me";

/** Notification centre: empty until notifications arrive in phase 7. */
export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("notifications");
  return (
    <AppShell viewer={viewer}>
      <Card>
        <CardTitle>{t("title")}</CardTitle>
        <p className="mt-2 text-sm text-warm-600">{t("empty")}</p>
      </Card>
    </AppShell>
  );
}

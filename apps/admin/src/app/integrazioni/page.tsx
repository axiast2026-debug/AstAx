import { formatDateTime } from "@astax/shared/format";
import { Badge, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface Integration {
  key: string;
  adapter: "FAKE" | "REAL" | "OFF";
  lastActivity: string | null;
  problems: number;
}

/** Spec 07 «Integrazioni»: which adapter each provider uses and its last signs. */
export default async function IntegrationsPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("integrations");
  const { status, body } = await api<Integration[]>("/admin/integrations");
  if (status !== 200) notFound();
  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {body.map((i) => (
          <Card key={i.key}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{t(`names.${i.key}`)}</h2>
              <Badge
                tone={
                  i.adapter === "REAL" ? "success" : i.adapter === "OFF" ? "neutral" : "warning"
                }
              >
                {t(`adapters.${i.adapter}`)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-warm-600">
              {i.lastActivity
                ? t("lastActivity", { at: formatDateTime(i.lastActivity) })
                : t("noActivity")}
            </p>
            {i.problems > 0 ? (
              <p className="mt-1 text-sm font-semibold text-red-700">
                {t(`problems.${i.key}`, { count: i.problems })}
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

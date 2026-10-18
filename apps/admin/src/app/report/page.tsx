import { can } from "@astax/shared/permissions";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/me";

const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * Spec 07 «Report ed esportazioni» (decision F: simple CSV files, to confirm
 * with the lawyer and the accountant): requests, accounting, the audit log,
 * the complaints for IVASS. Every export is itself in the audit log.
 */
export default async function ReportsPage() {
  const viewer = await requireViewer();
  if (!can(viewer.actor, "admin.reports.view")) notFound();
  const t = await getTranslations("reports");
  const exports = [
    { key: "requests", action: "/report/file/requests" },
    { key: "accounting", action: "/report/file/accounting" },
    ...(can(viewer.actor, "auditLog.viewAll")
      ? [{ key: "audit", action: "/report/file/audit" }]
      : []),
  ];
  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {exports.map((e) => (
          <Card key={e.key}>
            <CardTitle>{t(`items.${e.key}.title`)}</CardTitle>
            <p className="mt-1 text-sm text-warm-600">{t(`items.${e.key}.text`)}</p>
            <form
              method="get"
              action={e.action}
              className="mt-3 flex flex-wrap items-end gap-3 text-sm"
            >
              <label className="grid gap-1">
                {t("from")}
                <input type="date" name="da" required className={field} />
              </label>
              <label className="grid gap-1">
                {t("to")}
                <input type="date" name="a" required className={field} />
              </label>
              <Button type="submit" size="sm" variant="outline">
                {t("download")}
              </Button>
            </form>
          </Card>
        ))}
        <Card>
          <CardTitle>{t("items.complaints.title")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">{t("items.complaints.text")}</p>
          <Link href="/reclami" className="mt-3 inline-block text-sm underline">
            {t("toComplaints")}
          </Link>
        </Card>
        <Card>
          <CardTitle>{t("items.privacy.title")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">{t("items.privacy.text")}</p>
          <Link href="/clienti" className="mt-3 inline-block text-sm underline">
            {t("toCustomers")}
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}

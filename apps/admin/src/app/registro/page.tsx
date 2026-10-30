import { formatDateTime } from "@astax/shared/format";
import { buttonVariants, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { Info } from "@/components/info";

interface AuditPage {
  entries: {
    seq: string;
    at: string;
    action: string;
    actorUserId: string | null;
    actorOrganizationId: string | null;
    targetType: string | null;
    targetId: string | null;
    reason: string | null;
  }[];
  nextBefore: string | null;
}

/** Read-only audit log (fase 1, passo 12; auditLog.viewAll). */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("audit");
  const before = (await searchParams).before;
  const query = new URLSearchParams({
    limit: "50",
    ...(before && /^\d+$/.test(before) ? { before } : {}),
  });
  const { status, body } = await api<AuditPage>(`/admin/audit?${query}`);
  if (status === 403) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
      <Card className="mt-6 overflow-x-auto p-0">
        {body.entries.length === 0 ? (
          <p className="p-6 text-sm">{t("empty")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-warm-100 text-warm-800">
              <tr>
                <th className="px-4 py-2 font-medium">{t("at")}</th>
                <th className="px-4 py-2 font-medium">{t("action")}</th>
                <th className="px-4 py-2 font-medium">{t("actor")}</th>
                <th className="px-4 py-2 font-medium">{t("organization")}</th>
                <th className="px-4 py-2 font-medium">{t("target")}</th>
                <th className="px-4 py-2 font-medium">{t("reason")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200">
              {body.entries.map((e) => (
                <tr key={e.seq} className="align-top">
                  <td className="tabular whitespace-nowrap px-4 py-2">{formatDateTime(e.at)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.actorUserId ?? t("system")}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.actorOrganizationId ?? ""}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {e.targetType ? `${e.targetType} ${e.targetId ?? ""}` : ""}
                  </td>
                  <td className="px-4 py-2">{e.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {body.nextBefore ? (
        <a
          href={`/registro?before=${body.nextBefore}`}
          className={buttonVariants({ variant: "outline", className: "mt-4" })}
        >
          {t("older")}
        </a>
      ) : null}
    </AppShell>
  );
}

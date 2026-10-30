import { formatDateTime } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { Info } from "@/components/info";

interface AccessLog {
  entries: {
    seq: string;
    at: string;
    action: string;
    user: string | null;
    requestCode: string | null;
    targetType: string | null;
  }[];
  next: string | null;
}

/** VIS-08: the agency owner sees the accesses of the agency's users to customer data. */
export default async function AccessLogPage({
  searchParams,
}: {
  searchParams: Promise<{ prima?: string }>;
}) {
  const viewer = await requireViewer();
  if (!can(viewer.actor, "accessLog.viewOwnAgency")) notFound();
  const t = await getTranslations("team.log");
  const before = (await searchParams).prima;
  const { body: log } = await api<AccessLog>(
    `/agency/access-log${before && /^\d+$/.test(before) ? `?before=${before}` : ""}`,
  );

  return (
    <AppShell viewer={viewer}>
      <Link href="/team" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
      {log.entries.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-warm-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-warm-100 text-xs uppercase text-warm-600">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {t("when")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("who")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("what")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("request")}
                </th>
              </tr>
            </thead>
            <tbody>
              {log.entries.map((e) => (
                <tr key={e.seq} className="border-t border-warm-200">
                  <td className="px-3 py-2 tabular">{formatDateTime(e.at)}</td>
                  <td className="px-3 py-2">{e.user ?? "—"}</td>
                  <td className="px-3 py-2">
                    {t.has(`actions.${e.action}`) ? t(`actions.${e.action}`) : e.action}
                  </td>
                  <td className="px-3 py-2">{e.requestCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {log.next ? (
        <Link href={`/team/registro?prima=${log.next}`} className="mt-4 inline-block underline">
          {t("older")}
        </Link>
      ) : null}
    </AppShell>
  );
}

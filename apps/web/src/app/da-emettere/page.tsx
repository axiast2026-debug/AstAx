import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import type { ToIssueRow } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { Info } from "@/components/info";

/**
 * «Da emettere» (spec 04, EMI-01): the policies won and paid, the nearest
 * deadline first, with the customer's contacts (VIS-02: only now, after the
 * payment; the API logs each opening).
 */
export default async function ToIssuePage() {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("toIssue");
  const { status, body: rows } = await api<ToIssueRow[]>("/agency/to-issue");
  if (status !== 200) notFound();
  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
      {rows.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-warm-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-warm-100 text-xs uppercase text-warm-600">
              <tr>
                {[
                  "code",
                  "holder",
                  "vehicle",
                  "start",
                  "premium",
                  "paidAt",
                  "deadline",
                  "contacts",
                ].map((key) => (
                  <th key={key} scope="col" className="px-3 py-2">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200">
              {rows.map((r) => (
                <tr key={r.auctionId}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/da-emettere/${r.requestId}`} className="underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.holder}</td>
                  <td className="px-3 py-2">{r.vehicle}</td>
                  <td className="px-3 py-2">{r.startDate ? formatDate(r.startDate) : ""}</td>
                  <td className="px-3 py-2 tabular">{formatEuroCents(r.premiumCents)}</td>
                  <td className="px-3 py-2">{r.paidAt ? formatDateTime(r.paidAt) : ""}</td>
                  <td className="px-3 py-2 font-semibold">
                    {r.issuanceDeadlineAt ? formatDateTime(r.issuanceDeadlineAt) : ""}
                  </td>
                  <td className="px-3 py-2">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="block underline">
                        {r.email}
                      </a>
                    ) : null}
                    {r.phone ? (
                      <a href={`tel:${r.phone}`} className="block underline">
                        {r.phone}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

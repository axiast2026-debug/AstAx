import { formatDateTime } from "@astax/shared/format";
import { Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import type { RequestDetail, RequestSummary } from "@/lib/requests";

/** The private customer's archive of documents (spec 03 «Documenti»). */
export default async function DocumentsPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("documentsArchive");
  const tk = await getTranslations("wizard.documentKinds");
  const { body: requests } = await api<RequestSummary[]>("/requests");
  const details = await Promise.all(
    requests.map(async (r) => (await api<RequestDetail>(`/requests/${r.id}`)).body),
  );
  const rows = details.flatMap((d) => d.documents.map((doc) => ({ request: d, doc })));
  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {rows.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-2 text-sm">
          {rows.map(({ request, doc }) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-warm-200 bg-white p-3"
            >
              <a
                href={`/preventivi/${request.id}/documenti/${doc.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                {tk(doc.kind)}
              </a>
              <span className="text-warm-600">{request.code}</span>
              <time dateTime={doc.uploadedAt} className="text-warm-600">
                {formatDateTime(doc.uploadedAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

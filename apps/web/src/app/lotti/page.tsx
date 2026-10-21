import { formatDate } from "@astax/shared/format";
import { Button, buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { uploadBatch } from "./actions";

interface Batch {
  id: string;
  code: string;
  fileName: string;
  rows: number;
  createdAt: string;
  statuses: Record<string, number>;
  nextSubmitAt: string | null;
}

/**
 * The broker's lots (ADR 0014, Dan 2026-10-21, docs/piano-broker.md C-E): the
 * template, the upload, and the lots already loaded. The whole file is checked
 * first: if a row is wrong nothing is saved and every error has its row.
 */
export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("batches");
  const ts = await getTranslations("requestStatus");
  const query = await searchParams;
  const errors = (query.errore ?? "").split(",").filter(Boolean);
  const { body: batches } = await api<Batch[]>("/broker/batches");

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-sm text-warm-600">{t("intro")}</p>
      {errors.length > 0 ? (
        <div role="alert" className="mt-6 rounded-xl border border-red-600 bg-red-50 p-4 text-sm">
          <p className="font-semibold text-red-700">{t("errorsTitle")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((e) => {
              const [where = "", issue = e] = e.includes("=") ? e.split("=") : ["", e];
              return (
                <li key={e}>
                  {where ? `${where}: ` : ""}
                  {t.has(`issues.${issue}`) ? t(`issues.${issue}`) : issue}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm">{t("templateHint")}</p>
          <a href="/lotti/modello" className={buttonVariants({ variant: "outline" })}>
            {t("template")}
          </a>
        </div>
        <form action={uploadBatch} className="mt-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            {t("file")}
            <input
              type="file"
              name="file"
              required
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />
          </label>
          <Button type="submit">{t("upload")}</Button>
        </form>
      </Card>

      <Card className="mt-6">
        <CardTitle>{t("list")}</CardTitle>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">{t("list")}</caption>
            <thead>
              <tr className="text-left text-warm-600">
                <th scope="col" className="py-2">
                  {t("code")}
                </th>
                <th scope="col">{t("fileName")}</th>
                <th scope="col">{t("rows")}</th>
                <th scope="col">{t("progress")}</th>
                <th scope="col">{t("nextLeaves")}</th>
                <th scope="col">{t("created")}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-warm-200">
                  <td className="py-2">
                    <Link href={`/lotti/${b.id}`} className="underline">
                      {b.code}
                    </Link>
                  </td>
                  <td>{b.fileName}</td>
                  <td className="tabular">{b.rows}</td>
                  <td>
                    {Object.entries(b.statuses)
                      .map(([status, n]) => `${ts(status)}: ${n}`)
                      .join(" · ")}
                  </td>
                  <td className="tabular">{b.nextSubmitAt ? formatDate(b.nextSubmitAt) : "—"}</td>
                  <td className="tabular">{formatDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {batches.length === 0 ? <p className="mt-3 text-sm">{t("empty")}</p> : null}
      </Card>
    </AppShell>
  );
}

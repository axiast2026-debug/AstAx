import { BULK_CSV_HEADER } from "@astax/shared/domain";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/me";
import { bulkUpload } from "./actions";
import { Info } from "@/components/info";

/**
 * The broker's bulk upload (phase 7): one customer per row, with the
 * documents in the same ZIP. The whole file is checked first: if a row is
 * wrong nothing is saved and every error is listed with its row.
 */
export default async function BulkUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("bulkUpload");
  const query = await searchParams;
  const errors = (query.errore ?? "").split(",").filter(Boolean);
  const done = (query.fatto ?? "")
    .split(",")
    .filter(Boolean)
    .map((x) => {
      const [line = "", code = "", customer = "", documents = "0"] = x.split(":");
      return { line, code, customer, documents: Number(documents) || 0 };
    });

  return (
    <AppShell viewer={viewer}>
      <Link href="/clienti" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
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
      {done.length > 0 ? (
        <Card className="mt-6">
          <CardTitle>{t("doneTitle", { count: done.length })}</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {done.map((d) => (
              <li key={d.code}>
                {t("doneRow", {
                  line: d.line,
                  code: d.code,
                  customer: d.customer === "EXISTING" ? t("existing") : t("created"),
                  documents: d.documents,
                })}
              </li>
            ))}
          </ul>
          <Link href="/richieste" className="mt-3 inline-block text-sm underline">
            {t("toDrafts")}
          </Link>
        </Card>
      ) : null}
      <Card className="mt-6">
        <CardTitle>{t("format")}</CardTitle>
        <p className="mt-2 text-sm">{t("formatText")}</p>
        <pre className="mt-2 overflow-x-auto rounded bg-warm-100 p-2 text-xs">
          {BULK_CSV_HEADER}
        </pre>
        <p className="mt-2 text-sm text-warm-600">{t("formatHint")}</p>
        <form action={bulkUpload} className="mt-4 flex flex-wrap items-end gap-3 text-sm">
          <input type="file" name="file" required accept=".csv,.zip,text/csv,application/zip" />
          <Button type="submit">{t("upload")}</Button>
        </form>
      </Card>
    </AppShell>
  );
}

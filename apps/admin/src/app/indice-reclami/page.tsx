import { Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { setComplaintsIndex } from "./actions";
import { Info } from "@/components/info";

interface CompanyIndex {
  companyId: string;
  company: string;
  values: { year: number; value: number; source: string; updatedAt: string }[];
}

/**
 * The complaints index of the companies (phase 5, PRES-07): what the AI
 * comparison reads, neutral when a company has none. Synthetic values in
 * development; the real ones are entered here when Dan has them.
 */
export default async function ComplaintsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("complaintsIndex");
  const query = await searchParams;
  const { status, body } = await api<CompanyIndex[]>("/admin/complaints-index");
  if (status === 403) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("saved")}
        </p>
      ) : null}
      <div className="mt-6 space-y-4">
        {body.map((c) => {
          const latest = c.values[0];
          return (
            <Card key={c.companyId}>
              <section aria-label={c.company}>
                <h2 className="font-semibold">{c.company}</h2>
                <p className="mt-1 text-sm text-warm-600">
                  {t("latest")}:{" "}
                  {latest
                    ? t("entry", {
                        value: String(latest.value).replace(".", ","),
                        year: latest.year,
                        source: latest.source,
                      })
                    : t("none")}
                </p>
                <form
                  action={setComplaintsIndex}
                  className="mt-3 grid gap-3 text-sm sm:grid-cols-[6rem_10rem_1fr_auto] sm:items-end"
                >
                  <input type="hidden" name="companyId" value={c.companyId} />
                  <label className="grid gap-1">
                    {t("year")}
                    <input
                      name="year"
                      type="number"
                      min={2000}
                      max={2100}
                      required
                      defaultValue={latest?.year}
                      className="rounded-lg border border-warm-200 px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1">
                    {t("value")}
                    <input
                      name="value"
                      inputMode="decimal"
                      required
                      pattern="\d+([.,]\d+)?"
                      className="rounded-lg border border-warm-200 px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1">
                    {t("source")}
                    <input
                      name="source"
                      required
                      minLength={3}
                      maxLength={300}
                      defaultValue={latest?.source}
                      className="rounded-lg border border-warm-200 px-3 py-2"
                    />
                  </label>
                  <Button type="submit">{t("save")}</Button>
                </form>
              </section>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}

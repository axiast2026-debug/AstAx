import { Button, Card, CompanyLogo } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Info } from "@/components/info";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { setCompanyLogo } from "./actions";

interface CompanyRow {
  companyId: string;
  company: string;
  group: string | null;
  website: string | null;
  ivassCode: string | null;
  hasLogo: boolean;
  active: boolean;
}

/**
 * The insurance companies and their logos (ADR 0028): the logo shown next to
 * the offers, uploaded or replaced here. PNG or SVG; without one the offers
 * show the name with a neutral placeholder.
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("companiesAdmin");
  const tl = await getTranslations("legal");
  const query = await searchParams;
  const { status, body } = await api<CompanyRow[]>("/admin/companies");
  if (status === 403) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {query.errore === "LOGO_PNG_OR_SVG" || query.errore === "FILE_REQUIRED"
            ? t(`errors.${query.errore}`)
            : t("error", { code: query.errore })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("saved")}
        </p>
      ) : null}
      <div className="mt-6 space-y-4">
        {body.map((c) => (
          <Card key={c.companyId}>
            <section aria-label={c.company} className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="flex h-16 items-center justify-center rounded-lg border border-warm-200 bg-white p-2">
                <CompanyLogo companyId={c.companyId} name={c.company} size="detail" />
              </div>
              <div>
                <h2 className="font-semibold">{c.company}</h2>
                <p className="mt-1 text-sm text-warm-600">
                  {[
                    c.group ? t("group", { name: c.group }) : null,
                    c.website,
                    c.ivassCode ? t("ivass", { code: c.ivassCode }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("noDetails")}
                </p>
                <p className="mt-1 text-sm">{c.hasLogo ? t("hasLogo") : t("noLogo")}</p>
                <form
                  action={setCompanyLogo}
                  className="mt-3 flex flex-wrap items-end gap-3 text-sm"
                >
                  <input type="hidden" name="companyId" value={c.companyId} />
                  <label className="grid gap-1">
                    {t("file")}
                    <input
                      name="file"
                      type="file"
                      accept="image/png,image/svg+xml"
                      required
                      className="rounded-lg border border-warm-200 px-3 py-2"
                    />
                  </label>
                  <Button type="submit">{c.hasLogo ? t("replace") : t("upload")}</Button>
                </form>
              </div>
            </section>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-note text-warm-600">{tl("trademarks")}</p>
    </AppShell>
  );
}

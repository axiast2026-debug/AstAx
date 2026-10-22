import { formatDateTime } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { newVersion, versionStep } from "./actions";

interface Version {
  id: string;
  number: number;
  status: "DRAFT" | "VALIDATED";
  contentMd: string;
  validatedAt: string | null;
  publishedAt: string | null;
}

interface LegalDocument {
  key: string;
  title: string;
  audiences: string[];
  moment: string;
  versions: Version[];
}

const DONE = ["draft", "validate", "publish"] as const;
const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * «Contratti e documenti legali» (spec 07): every text with its versions; a
 * new version is a draft in Markdown, validated by the lawyer (LEG-03) and
 * published apart: then everyone concerned accepts it again (LEG-02).
 */
export default async function LegalDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ documento?: string; errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("legalDocuments");
  const query = await searchParams;
  const { status, body } = await api<LegalDocument[]>("/admin/legal/documents");
  if (status !== 200) notFound();
  const selected = body.find((d) => d.key === query.documento);
  const inForce = selected?.versions.find((v) => v.publishedAt !== null);
  const done = DONE.find((d) => d === query.fatto);

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${done}`)}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardTitle>{t("documents")}</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {body.map((d) => (
              <li key={d.key}>
                <Link
                  href={`/documenti-legali?documento=${d.key}`}
                  aria-current={d.key === selected?.key ? "page" : undefined}
                  className={d.key === selected?.key ? "font-semibold underline" : "underline"}
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {selected ? (
          <div className="space-y-6">
            <Card>
              <CardTitle>{selected.title}</CardTitle>
              <p className="mt-1 text-sm text-warm-600">
                {t("meta", {
                  audiences: selected.audiences.map((a) => t(`audiences.${a}`)).join(", "),
                  moment: t(`moments.${selected.moment}`),
                })}
              </p>
              <ul className="mt-4 space-y-4">
                {selected.versions.map((v) => (
                  <li key={v.id} className="rounded-lg border border-warm-200 p-3 text-sm">
                    <h3 className="font-semibold">
                      {t("version", { number: v.number })} ·{" "}
                      {v.status === "VALIDATED" ? t("validated") : t("draft")} ·{" "}
                      {v.publishedAt
                        ? v.id === inForce?.id
                          ? t("inForce", { at: formatDateTime(v.publishedAt) })
                          : t("replaced")
                        : t("notPublished")}
                    </h3>
                    <details className="mt-2">
                      <summary className="cursor-pointer underline">{t("text")}</summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans">{v.contentMd}</pre>
                    </details>
                    <div className="mt-3 flex flex-wrap gap-4">
                      {v.status === "DRAFT" ? (
                        <form action={versionStep} className="grid gap-2">
                          <input type="hidden" name="key" value={selected.key} />
                          <input type="hidden" name="versionId" value={v.id} />
                          <input type="hidden" name="step" value="validate" />
                          <label className="grid gap-1">
                            {t("reason")}
                            <input name="reason" required minLength={3} className={field} />
                          </label>
                          <Button type="submit" size="sm" variant="outline">
                            {t("validate")}
                          </Button>
                        </form>
                      ) : null}
                      {v.publishedAt === null && (inForce?.number ?? 0) < v.number ? (
                        <form action={versionStep} className="grid gap-2">
                          <input type="hidden" name="key" value={selected.key} />
                          <input type="hidden" name="versionId" value={v.id} />
                          <input type="hidden" name="step" value="publish" />
                          <label className="grid gap-1">
                            {t("summary")}
                            <input name="summary" required minLength={3} className={field} />
                          </label>
                          <label className="grid gap-1">
                            {t("reason")}
                            <input name="reason" required minLength={3} className={field} />
                          </label>
                          <Button type="submit" size="sm">
                            {t("publish")}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardTitle>{t("newVersion")}</CardTitle>
              <p className="mt-1 text-sm text-warm-600">{t("newVersionHint")}</p>
              <form action={newVersion} className="mt-3 grid gap-3 text-sm">
                <input type="hidden" name="key" value={selected.key} />
                <label className="grid gap-1">
                  {t("markdown")}
                  <textarea
                    name="contentMd"
                    required
                    rows={14}
                    defaultValue={selected.versions[0]?.contentMd ?? ""}
                    className={`${field} font-mono`}
                  />
                </label>
                <label className="grid gap-1">
                  {t("reason")}
                  <input name="reason" required minLength={3} className={field} />
                </label>
                <Button type="submit" className="justify-self-start">
                  {t("saveDraft")}
                </Button>
              </form>
            </Card>
          </div>
        ) : (
          <Card>
            <p className="text-sm text-warm-600">{t("choose")}</p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

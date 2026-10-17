import { formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { decideFlag } from "./actions";

interface FlagRow {
  id: string;
  type: "CIRCUMVENTION" | "FRAUD";
  source: string;
  code: string | null;
  agency: string | null;
  status: "OPEN" | "ARCHIVED" | "PENALTY_PROPOSED" | "SUSPENSION_PROPOSED";
  outcome: string | null;
  createdAt: string;
}

/**
 * «Segnalazioni» (spec 06): the possible circumventions (from the
 * questionnaire after the sale, phase 6) and frauds, with the outcome. The
 * access log of the request is in «Registro»; the full page is phase 7.
 */
export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("flagsPage");
  const query = await searchParams;
  const { status, body } = await api<FlagRow[]>("/back-office/flags");
  if (status !== 200) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error")}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done")}
        </p>
      ) : null}
      {body.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {body.map((f) => (
            <li key={f.id}>
              <Card>
                <section aria-label={f.code ?? f.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {t(`type.${f.type}`)}
                      {f.code ? ` · ${f.code}` : ""}
                      {f.agency ? ` · ${f.agency}` : ""}
                    </span>
                    <Badge tone={f.status === "OPEN" ? "warning" : "neutral"}>
                      {t(`status.${f.status}`)}
                    </Badge>
                  </div>
                  <p className="text-sm text-warm-600">
                    {t(`source.${f.source}`)} · {formatDateTime(f.createdAt)}
                  </p>
                  {f.outcome ? <p className="mt-1 text-sm">{f.outcome}</p> : null}
                  {f.status === "OPEN" ? (
                    <form
                      action={decideFlag}
                      className="mt-3 flex flex-wrap items-end gap-3 text-sm"
                    >
                      <input type="hidden" name="flagId" value={f.id} />
                      <label className="grid gap-1">
                        {t("outcomeLabel")}
                        <select
                          name="status"
                          className="rounded-lg border border-warm-200 px-3 py-2"
                          defaultValue="ARCHIVED"
                        >
                          <option value="ARCHIVED">{t("status.ARCHIVED")}</option>
                          <option value="PENALTY_PROPOSED">{t("status.PENALTY_PROPOSED")}</option>
                          <option value="SUSPENSION_PROPOSED">
                            {t("status.SUSPENSION_PROPOSED")}
                          </option>
                        </select>
                      </label>
                      <label className="grid gap-1">
                        {t("reason")}
                        <input
                          name="outcome"
                          required
                          minLength={3}
                          className="rounded-lg border border-warm-200 px-3 py-2"
                        />
                      </label>
                      <Button type="submit" size="sm">
                        {t("decide")}
                      </Button>
                    </form>
                  ) : null}
                </section>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

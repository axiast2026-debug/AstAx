import { formatDate } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { runRetention } from "@/app/retention-actions";
import { api } from "@/lib/auth";

interface Preview {
  months: number;
  before: string;
  candidates: { code: string; status: string; lastActivity: string }[];
  documents: number;
  lastPurged: { at: string; code: string }[];
}

/**
 * LEG-06, proposal G: what the next run deletes (requests not concluded,
 * untouched for the months of the parameter), the last deletions, the run.
 */
export async function RetentionCard({ purged }: { purged?: string }) {
  const t = await getTranslations("retention");
  const { status, body } = await api<Preview>("/admin/retention");
  if (status !== 200) return null;
  return (
    <Card className="mt-6">
      <CardTitle>{t("title")}</CardTitle>
      <p className="mt-1 text-sm text-warm-600">
        {t("intro", { months: body.months, before: formatDate(body.before) })}
      </p>
      {purged ? (
        <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm">
          {t("done", { count: Number(purged) || 0 })}
        </p>
      ) : null}
      <p className="mt-3 text-sm">
        {t("next", { count: body.candidates.length, documents: body.documents })}
      </p>
      {body.candidates.length > 0 ? (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
          {body.candidates.map((c) => (
            <li key={c.code}>
              {c.code} · {t(`statuses.${c.status}`)} ·{" "}
              {t("lastActivity", { at: formatDate(c.lastActivity) })}
            </li>
          ))}
        </ul>
      ) : null}
      <form action={runRetention} className="mt-3">
        <Button type="submit" size="sm" variant="outline" disabled={body.candidates.length === 0}>
          {t("run")}
        </Button>
      </form>
      {body.lastPurged.length > 0 ? (
        <>
          <h3 className="mt-4 text-sm font-semibold">{t("last")}</h3>
          <ul className="mt-1 space-y-1 text-sm text-warm-600">
            {body.lastPurged.map((p) => (
              <li key={`${p.code}-${p.at}`}>
                {p.code} · {formatDate(p.at)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

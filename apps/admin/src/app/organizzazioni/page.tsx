import { formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { PenaltiesList } from "@/components/penalties-list";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { decideSuspension } from "../penali/actions";

interface SuspensionRow {
  id: string;
  agency: string;
  reason: string;
  startedAt: string;
  confirmedAt: string | null;
  revokedAt: string | null;
}

/**
 * «Organizzazioni» (spec 07), for now: the suspensions to confirm or revoke
 * (EMI-06) and the contested penalties to decide (EMI-05). The rest of the
 * page (onboarding, exclusion) is phase 7.
 */
export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("organizationsPage");
  const query = await searchParams;
  const { status, body: suspensions } = await api<SuspensionRow[]>("/admin/suspensions");

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done")}
        </p>
      ) : null}
      {status === 200 ? (
        <Card className="mt-6">
          <CardTitle>{t("suspensions")}</CardTitle>
          {suspensions.length === 0 ? (
            <p className="mt-2 text-sm">{t("noSuspensions")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-warm-200 text-sm">
              {suspensions.map((s) => (
                <li key={s.id} className="py-3">
                  <section aria-label={s.agency}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{s.agency}</span>
                      <Badge tone={s.revokedAt ? "neutral" : s.confirmedAt ? "danger" : "warning"}>
                        {s.revokedAt
                          ? t("revoked")
                          : s.confirmedAt
                            ? t("confirmed")
                            : t("toDecide")}
                      </Badge>
                    </div>
                    <p className="text-warm-600">
                      {t("since", { at: formatDateTime(s.startedAt) })}
                    </p>
                    {!s.revokedAt ? (
                      <form
                        action={decideSuspension}
                        className="mt-2 flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="id" value={s.id} />
                        {!s.confirmedAt ? (
                          <label className="flex items-center gap-2">
                            <input type="radio" name="outcome" value="CONFIRM" defaultChecked />
                            {t("confirm")}
                          </label>
                        ) : null}
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="outcome"
                            value="REVOKE"
                            defaultChecked={Boolean(s.confirmedAt)}
                          />
                          {t("revoke")}
                        </label>
                        <label className="grid gap-1">
                          {t("reason")}
                          <input
                            name="reason"
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
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      <PenaltiesList mode="admin" />
    </AppShell>
  );
}

import {
  settingInputOf,
  settingsOfPage,
  type SettingKey,
  type SettingsPage,
} from "@astax/shared/settings";
import { formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changeSetting } from "@/app/settings-actions";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface SettingRow {
  key: SettingKey;
  value: unknown;
  version: number;
  validFrom: string | null;
}

interface HistoryRow {
  version: number;
  value: unknown;
  validFrom: string;
  reason: string | null;
}

const PATH: Record<SettingsPage, string> = {
  auctionRules: "/regole-asta",
  economy: "/economia",
  system: "/sicurezza-dati",
};

const field = "rounded-lg border border-warm-200 px-3 py-2";

function shown(value: unknown, kind: string, yes: string, no: string) {
  if (kind === "money" && typeof value === "number") return formatEuroCents(value);
  if (kind === "boolean") return value ? yes : no;
  if (kind === "json") return JSON.stringify(value);
  return String(value);
}

function inputValue(value: unknown, kind: string) {
  if (kind === "money" && typeof value === "number") {
    return `${Math.floor(value / 100)},${String(value % 100).padStart(2, "0")}`;
  }
  if (kind === "json") return JSON.stringify(value, null, 2);
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Spec 07 «Regole d'asta», «Economia», «Sicurezza e dati»: every parameter
 * of its page with the value in force, a form to change it with a reason, and
 * on request the history of its versions (rule 7, ASTA-09).
 */
export async function SettingsPanel({
  page,
  query,
}: {
  page: SettingsPage;
  query: { errore?: string; fatto?: string; chiave?: string; storico?: string };
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("settingsPage");
  const { status, body } = await api<SettingRow[]>("/admin/settings");
  if (status !== 200) notFound();
  const history =
    query.storico && /^[A-Za-z0-9.]+$/.test(query.storico)
      ? await api<HistoryRow[]>(`/admin/settings/${query.storico}/history`).then((r) =>
          r.status === 200 ? r.body : [],
        )
      : null;
  const path = PATH[page];

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t(`titles.${page}`)}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done", { key: t(`labels.${query.fatto.replaceAll(".", "_")}`) })}
        </p>
      ) : null}
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : null}
      {settingsOfPage(page).map(({ group, keys }) => (
        <Card key={group} className="mt-6">
          <CardTitle>{t(`groups.${group}`)}</CardTitle>
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {keys.map((key) => {
              const row = body.find((r) => r.key === key);
              const kind = settingInputOf(key, row?.value);
              const label = t(`labels.${key.replaceAll(".", "_")}`);
              return (
                <li key={key} id={key.replaceAll(".", "-")} className="py-4">
                  <section aria-label={label}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium">{label}</h3>
                      <code className="text-xs text-warm-600">{key}</code>
                    </div>
                    <p className="mt-1">
                      {t("current")}:{" "}
                      <span className="font-semibold break-all">
                        {shown(row?.value, kind, t("yes"), t("no"))}
                      </span>
                      {row?.validFrom ? (
                        <span className="text-warm-600">
                          {" "}
                          ·{" "}
                          {t("since", { at: formatDateTime(row.validFrom), version: row.version })}
                        </span>
                      ) : null}
                    </p>
                    <form
                      action={changeSetting}
                      className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <input type="hidden" name="key" value={key} />
                      <input type="hidden" name="kind" value={kind} />
                      <input type="hidden" name="back" value={path} />
                      <label className="grid gap-1">
                        {kind === "money" ? t("euro") : t("newValue")}
                        {kind === "boolean" ? (
                          <select name="value" defaultValue={String(row?.value)} className={field}>
                            <option value="true">{t("yes")}</option>
                            <option value="false">{t("no")}</option>
                          </select>
                        ) : kind === "json" ? (
                          <textarea
                            name="value"
                            rows={4}
                            defaultValue={inputValue(row?.value, kind)}
                            className={`${field} font-mono text-xs`}
                          />
                        ) : (
                          <input
                            name="value"
                            required
                            inputMode={kind === "text" ? "text" : "decimal"}
                            defaultValue={inputValue(row?.value, kind)}
                            className={field}
                          />
                        )}
                      </label>
                      <label className="grid gap-1">
                        {t("reason")}
                        <input
                          name="reason"
                          required
                          minLength={3}
                          maxLength={500}
                          className={field}
                        />
                      </label>
                      <Button type="submit" size="sm" className="self-end">
                        {t("save")}
                      </Button>
                    </form>
                    {kind === "json" ? (
                      <p className="mt-1 text-xs text-warm-600">{t("jsonHint")}</p>
                    ) : null}
                    {query.storico === key ? (
                      <div className="mt-2">
                        <h4 className="font-medium">{t("history")}</h4>
                        {history && history.length > 0 ? (
                          <ul className="mt-1 space-y-1 text-warm-600">
                            {[...history].reverse().map((v) => (
                              <li key={v.version}>
                                {t("by", {
                                  version: v.version,
                                  at: formatDateTime(v.validFrom),
                                  reason: v.reason ?? "—",
                                })}
                                {": "}
                                <span className="break-all">
                                  {shown(v.value, kind, t("yes"), t("no"))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-warm-600">{t("noHistory")}</p>
                        )}
                      </div>
                    ) : (
                      <Link
                        className="mt-1 inline-block underline"
                        href={`${path}?storico=${key}#${key.replaceAll(".", "-")}`}
                      >
                        {t("history")}
                      </Link>
                    )}
                  </section>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </AppShell>
  );
}

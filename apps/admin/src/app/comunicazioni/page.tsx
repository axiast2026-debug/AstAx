import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { broadcast, saveTemplate, testTemplate } from "./actions";

interface Template {
  eventKey: string;
  version: number;
  channels: string[];
  mandatory: boolean;
  forcePush: boolean;
  variables: string[];
  it: Record<string, string | undefined>;
}

const FIELDS = ["title", "body", "emailSubject", "emailBody", "sms"] as const;
const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * «Comunicazioni» (spec 07): the texts of every notification, edited with a
 * reason (a new version), the preview with the names of the variables, a
 * test sent to oneself; the messages to a group of users.
 */
export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; errore?: string; fatto?: string; inviati?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("communications");
  const query = await searchParams;
  const { status, body } = await api<Template[]>("/admin/notification-templates");
  if (status !== 200) notFound();
  const selected = body.find((x) => x.eventKey === query.evento);
  const preview = selected
    ? await api<Record<string, string>>(
        `/admin/notification-templates/${selected.eventKey}/preview`,
        { method: "POST", body: "{}" },
      ).then((res) => (res.status === 200 ? res.body : {}))
    : null;
  const groups = [...new Set(body.map((x) => x.eventKey.split(".")[0] ?? x.eventKey))];

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : null}
      {query.fatto || query.inviati ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {query.inviati
            ? t("sent", { count: Number(query.inviati) || 0 })
            : t(query.fatto === "prova" ? "done.test" : "done.saved")}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardTitle>{t("events")}</CardTitle>
          {groups.map((g) => (
            <div key={g} className="mt-3">
              <h3 className="text-xs font-semibold uppercase text-warm-600">{g}</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {body
                  .filter((x) => x.eventKey.split(".")[0] === g)
                  .map((x) => (
                    <li key={x.eventKey}>
                      <Link
                        href={`/comunicazioni?evento=${x.eventKey}`}
                        aria-current={x.eventKey === selected?.eventKey ? "page" : undefined}
                        className={
                          x.eventKey === selected?.eventKey
                            ? "font-semibold underline"
                            : "underline"
                        }
                      >
                        {x.eventKey}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Card>

        <div className="space-y-6">
          {selected ? (
            <Card>
              <CardTitle>{selected.eventKey}</CardTitle>
              <p className="mt-1 text-sm text-warm-600">
                {t("meta", {
                  version: selected.version,
                  channels: selected.channels.join(", "),
                  variables: selected.variables.map((v) => `{{${v}}}`).join(" ") || "—",
                })}
                {selected.mandatory ? ` · ${t("mandatory")}` : ""}
                {selected.forcePush ? ` · ${t("forcePush")}` : ""}
              </p>
              <form action={saveTemplate} className="mt-4 grid gap-4 text-sm">
                <input type="hidden" name="eventKey" value={selected.eventKey} />
                <div className="grid gap-2">
                  {FIELDS.map((f) => {
                    const value = selected.it[f] ?? "";
                    return (
                      <label key={f} className="grid gap-1">
                        {t(`field.${f}`)}
                        {f === "emailBody" || f === "body" ? (
                          <textarea
                            name={`it.${f}`}
                            rows={f === "emailBody" ? 5 : 2}
                            defaultValue={value}
                            className={field}
                          />
                        ) : (
                          <input name={`it.${f}`} defaultValue={value} className={field} />
                        )}
                      </label>
                    );
                  })}
                </div>
                <label className="grid gap-1">
                  {t("reason")}
                  <input name="reason" required minLength={3} className={field} />
                </label>
                <Button type="submit" className="justify-self-start">
                  {t("save")}
                </Button>
              </form>
              <form action={testTemplate} className="mt-3">
                <input type="hidden" name="eventKey" value={selected.eventKey} />
                <Button type="submit" size="sm" variant="outline">
                  {t("test")}
                </Button>
              </form>
              <h3 className="mt-6 font-semibold">{t("preview")}</h3>
              <section
                aria-label={t("preview")}
                className="mt-2 rounded-lg bg-warm-100 p-3 text-sm"
              >
                {Object.entries(preview ?? {}).map(([k, v]) => (
                  <p key={k} className="mt-1 whitespace-pre-line">
                    <span className="text-warm-600">{t(`field.${k}`)}: </span>
                    {v}
                  </p>
                ))}
              </section>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-warm-600">{t("choose")}</p>
            </Card>
          )}

          <Card>
            <CardTitle>{t("broadcastTitle")}</CardTitle>
            <form action={broadcast} className="mt-3 grid gap-3 text-sm">
              <label className="grid gap-1">
                {t("group")}
                <select name="group" className={field}>
                  {(["PRIVATE", "AGENCY", "BROKER", "STAFF"] as const).map((g) => (
                    <option key={g} value={g}>
                      {t(`groups.${g}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                {t("messageTitle")}
                <input name="title" required minLength={3} maxLength={120} className={field} />
              </label>
              <label className="grid gap-1">
                {t("messageText")}
                <textarea
                  name="text"
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={4}
                  className={field}
                />
              </label>
              <label className="grid gap-1">
                {t("reason")}
                <input name="reason" required minLength={3} className={field} />
              </label>
              <Button type="submit" className="justify-self-start">
                {t("send")}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

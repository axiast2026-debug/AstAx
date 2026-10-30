import { formatDate } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { registerComplaint } from "./actions";
import { Info } from "@/components/info";

interface Row {
  id: string;
  protocol: string;
  subject: string;
  channel: string;
  status: "OPEN" | "ANSWERED";
  receivedAt: string;
  dueAt: string;
  late: boolean;
  intermediary: string | null;
}

const STATUSES = ["OPEN", "ANSWERED", "ALL"] as const;
const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * «Reclami» (spec 06): the register by due date for the supervisor, with the
 * IVASS export; the registration of complaints received outside the app.
 */
export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; errore?: string; protocollo?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("complaintsRegister");
  const query = await searchParams;
  const status = STATUSES.find((s) => s === query.stato) ?? "OPEN";
  const manage = can(viewer.actor, "complaint.manage");
  const list = manage ? await api<Row[]>(`/back-office/complaints?status=${status}`) : null;

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
      ) : query.protocollo ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("registered", { protocol: query.protocollo })}
        </p>
      ) : null}

      {list?.status === 200 ? (
        <>
          <nav aria-label={t("filter")} className="mt-4 flex flex-wrap gap-4 text-sm">
            {STATUSES.map((s) => (
              <Link
                key={s}
                href={`/reclami?stato=${s}`}
                aria-current={s === status ? "page" : undefined}
                className={s === status ? "font-semibold underline" : "underline"}
              >
                {t(`status.${s}`)}
              </Link>
            ))}
          </nav>
          <div className="mt-4 space-y-3">
            {list.body.length === 0 ? <p className="text-sm text-warm-600">{t("empty")}</p> : null}
            {list.body.map((c) => (
              <Card key={c.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/reclami/${c.id}`} className="font-semibold underline">
                    {c.protocol} · {c.subject}
                  </Link>
                  {c.late ? <Badge tone="danger">{t("late")}</Badge> : null}
                </div>
                <p className="text-sm text-warm-600">
                  {t(`channels.${c.channel}`)} · {t("receivedAt", { at: formatDate(c.receivedAt) })}{" "}
                  · {t("dueAt", { at: formatDate(c.dueAt) })}
                  {c.intermediary ? ` · ${c.intermediary}` : ""}
                </p>
              </Card>
            ))}
          </div>
          <Card className="mt-6">
            <CardTitle>{t("export")}</CardTitle>
            <form
              method="get"
              action="/reclami/esportazione"
              className="mt-3 flex flex-wrap items-end gap-3 text-sm"
            >
              <label className="grid gap-1">
                {t("from")}
                <input type="date" name="da" required className={field} />
              </label>
              <label className="grid gap-1">
                {t("to")}
                <input type="date" name="a" required className={field} />
              </label>
              <Button type="submit" size="sm" variant="outline">
                {t("download")}
              </Button>
            </form>
          </Card>
        </>
      ) : null}

      <Card className="mt-6">
        <CardTitle>{t("new")}</CardTitle>
        <form action={registerComplaint} className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <label className="grid gap-1">
            {t("channel")}
            <select name="channel" className={field}>
              {(["PEC", "EMAIL", "POST", "PHONE"] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`channels.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            {t("receivedOn")}
            <input type="date" name="receivedOn" required className={field} />
          </label>
          <label className="grid gap-1">
            {t("complainantName")}
            <input name="complainantName" required minLength={2} className={field} />
          </label>
          <label className="grid gap-1">
            {t("complainantEmail")}
            <input name="complainantEmail" type="email" className={field} />
          </label>
          <label className="grid gap-1">
            {t("requestCode")}
            <input name="requestCode" className={field} />
          </label>
          <label className="grid gap-1 md:col-span-2">
            {t("subject")}
            <input name="subject" required minLength={3} className={field} />
          </label>
          <label className="grid gap-1 md:col-span-2">
            {t("description")}
            <textarea name="description" required minLength={10} rows={4} className={field} />
          </label>
          <Button type="submit" className="justify-self-start">
            {t("register")}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}

import { formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { openTicket } from "./actions";
import { Info } from "@/components/info";

interface Row {
  id: string;
  code: string;
  subject: string;
  channel: string;
  status: string;
  dueAt: string;
  answered: boolean;
  late: boolean;
  assignedTo: string | null;
}

const STATUSES = ["OPEN", "WAITING_CUSTOMER", "CLOSED", "ALL"] as const;
const field = "rounded-lg border border-warm-200 px-3 py-2";

/** Spec 06 «Assistenza»: the tickets by due time, the new ticket. */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; miei?: string; errore?: string; cliente?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("support");
  const query = await searchParams;
  const status = STATUSES.find((s) => s === query.stato) ?? "OPEN";
  const mine = query.miei === "1";
  const { status: code, body } = await api<Row[]>(
    `/back-office/tickets?status=${status}${mine ? "&mine=1" : ""}`,
  );
  if (code !== 200) notFound();

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
      ) : null}
      <nav aria-label={t("filter")} className="mt-4 flex flex-wrap gap-4 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/assistenza?stato=${s}${mine ? "&miei=1" : ""}`}
            aria-current={s === status ? "page" : undefined}
            className={s === status ? "font-semibold underline" : "underline"}
          >
            {t(`status.${s}`)}
          </Link>
        ))}
        <Link href={`/assistenza?stato=${status}${mine ? "" : "&miei=1"}`} className="underline">
          {mine ? t("everyone") : t("mine")}
        </Link>
      </nav>
      <div className="mt-4 space-y-3">
        {body.length === 0 ? <p className="text-sm text-warm-600">{t("empty")}</p> : null}
        {body.map((x) => (
          <Card key={x.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/assistenza/${x.id}`} className="font-semibold underline">
                {x.code} · {x.subject}
              </Link>
              {x.late ? <Badge tone="danger">{t("late")}</Badge> : null}
            </div>
            <p className="text-sm text-warm-600">
              {t(`channels.${x.channel}`)} · {t(`status.${x.status}`)} ·{" "}
              {t("dueAt", { at: formatDateTime(x.dueAt) })}
              {x.assignedTo ? ` · ${x.assignedTo}` : ""}
            </p>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <CardTitle>{t("newTicket")}</CardTitle>
        <form action={openTicket} className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <input type="hidden" name="customerId" value={query.cliente ?? ""} />
          <label className="grid gap-1 md:col-span-2">
            {t("subject")}
            <input name="subject" required minLength={3} className={field} />
          </label>
          <label className="grid gap-1">
            {t("channel")}
            <select name="channel" className={field}>
              {(["EMAIL", "PHONE", "CHAT"] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`channels.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            {t("contactEmail")}
            <input name="contactEmail" type="email" className={field} />
          </label>
          <label className="grid gap-1">
            {t("requestCode")}
            <input name="requestCode" className={field} />
          </label>
          <label className="grid gap-1 md:col-span-2">
            {t("text")}
            <textarea name="text" required minLength={3} rows={4} className={field} />
          </label>
          <Button type="submit" className="justify-self-start">
            {t("open")}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}

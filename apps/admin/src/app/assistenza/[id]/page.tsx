import { formatDateTime } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { ticketStep } from "../actions";

interface Detail {
  id: string;
  code: string;
  subject: string;
  channel: string;
  status: "OPEN" | "WAITING_CUSTOMER" | "CLOSED";
  locale: "it" | "sq";
  contactEmail: string | null;
  customer: { id: string; name: string } | null;
  requestCode: string | null;
  assignedToMe: boolean;
  dueAt: string;
  firstAnsweredAt: string | null;
  messages: { kind: string; text: string; at: string; author: string | null }[];
  readyReplies: { code: string; text: string }[];
}

const field = "rounded-lg border border-warm-200 px-3 py-2";

/** One ticket: the conversation, the ready replies, the reply or the internal note. */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; fatto?: string; risposta?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer();
  const t = await getTranslations("support");
  const locale = (await getLocale()) === "sq" ? "sq" : "it";
  const query = await searchParams;
  const { status, body: x } = await api<Detail>(`/back-office/tickets/${id}`);
  if (status !== 200) notFound();
  const ready = x.readyReplies.find((r) => r.code === query.risposta)?.text ?? "";

  return (
    <AppShell viewer={viewer}>
      <Link href="/assistenza" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {x.code} · {x.subject}
      </h1>
      <p className="mt-1 text-sm text-warm-600">
        {t(`channels.${x.channel}`)} · {t(`status.${x.status}`)} · {t(`languages.${x.locale}`)} ·{" "}
        {x.firstAnsweredAt
          ? t("answeredAt", { at: formatDateTime(x.firstAnsweredAt, locale) })
          : t("dueAt", { at: formatDateTime(x.dueAt, locale) })}
      </p>
      <p className="text-sm">
        {x.contactEmail ?? t("noEmail")}
        {x.customer ? (
          <>
            {" · "}
            <Link href={`/clienti/${x.customer.id}`} className="underline">
              {x.customer.name}
            </Link>
          </>
        ) : null}
        {x.requestCode ? ` · ${x.requestCode}` : ""}
      </p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done")}
        </p>
      ) : null}

      <Card className="mt-6">
        <CardTitle>{t("conversation")}</CardTitle>
        <ul className="mt-3 space-y-3 text-sm">
          {x.messages.map((m) => (
            <li
              key={`${m.at}-${m.kind}`}
              className={
                m.kind === "NOTE" ? "rounded-lg bg-orange-500/10 p-2" : "rounded-lg bg-warm-100 p-2"
              }
            >
              <span className="text-xs text-warm-600">
                {t(`kinds.${m.kind}`)} · {formatDateTime(m.at, locale)}
                {m.author ? ` · ${m.author}` : ""}
              </span>
              <p className="mt-1 whitespace-pre-line">{m.text}</p>
            </li>
          ))}
        </ul>
      </Card>

      {x.status === "CLOSED" ? null : (
        <Card className="mt-6">
          <CardTitle>{t("answer")}</CardTitle>
          <p className="mt-1 text-sm">
            {t("readyReplies")}{" "}
            {x.readyReplies.map((r) => (
              <Link
                key={r.code}
                href={`/assistenza/${x.id}?risposta=${r.code}`}
                className="mr-3 underline"
              >
                {r.text.length > 40 ? `${r.text.slice(0, 40)}…` : r.text}
              </Link>
            ))}
          </p>
          <form action={ticketStep} className="mt-3 grid gap-3 text-sm">
            <input type="hidden" name="id" value={x.id} />
            <div className="flex flex-wrap gap-6">
              {x.contactEmail ? (
                <label className="flex items-center gap-2">
                  <input type="radio" name="step" value="REPLY" defaultChecked />
                  {t("reply")}
                </label>
              ) : null}
              <label className="flex items-center gap-2">
                <input type="radio" name="step" value="NOTE" defaultChecked={!x.contactEmail} />
                {t("note")}
              </label>
            </div>
            <textarea
              name="text"
              required
              minLength={3}
              rows={5}
              defaultValue={ready}
              className={field}
            />
            <Button type="submit" className="justify-self-start">
              {t("send")}
            </Button>
          </form>
        </Card>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {!x.assignedToMe ? (
          <form action={ticketStep}>
            <input type="hidden" name="id" value={x.id} />
            <input type="hidden" name="step" value="assign" />
            <Button type="submit" size="sm" variant="outline">
              {t("assignToMe")}
            </Button>
          </form>
        ) : null}
        {(["OPEN", "WAITING_CUSTOMER", "CLOSED"] as const)
          .filter((s) => s !== x.status)
          .map((s) => (
            <form key={s} action={ticketStep}>
              <input type="hidden" name="id" value={x.id} />
              <input type="hidden" name="step" value={s} />
              <Button type="submit" size="sm" variant="outline">
                {t(`setStatus.${s}`)}
              </Button>
            </form>
          ))}
      </div>
    </AppShell>
  );
}

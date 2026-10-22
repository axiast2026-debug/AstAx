import { formatDate, formatDateTime } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { answerComplaint } from "../actions";

interface Detail {
  id: string;
  protocol: string;
  channel: string;
  status: "OPEN" | "ANSWERED";
  receivedAt: string;
  dueAt: string;
  complainantName: string;
  complainantEmail: string | null;
  fromApp: boolean;
  customerId: string | null;
  requestCode: string | null;
  intermediary: string | null;
  subject: string;
  description: string;
  responseText: string | null;
  outcome: string | null;
  answeredAt: string | null;
}

const field = "rounded-lg border border-warm-200 px-3 py-2";

/** One complaint: what was asked, the answer with its outcome (complaint.manage). */
export default async function ComplaintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer();
  const t = await getTranslations("complaintsRegister");
  const query = await searchParams;
  const { status, body: c } = await api<Detail>(`/back-office/complaints/${id}`);
  if (status !== 200) notFound();

  return (
    <AppShell viewer={viewer}>
      <Link href="/reclami" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {c.protocol} · {c.subject}
      </h1>
      <p className="mt-1 text-sm text-warm-600">
        {t(`channels.${c.channel}`)} · {t("receivedAt", { at: formatDate(c.receivedAt) })} ·{" "}
        {t("dueAt", { at: formatDate(c.dueAt) })}
      </p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("answered")}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("complainant")}</CardTitle>
          <p className="mt-2 text-sm">
            {c.complainantName} · {c.complainantEmail ?? "—"}
            {c.fromApp ? ` · ${t("fromApp")}` : ""}
          </p>
          {c.customerId ? (
            <Link href={`/clienti/${c.customerId}`} className="text-sm underline">
              {t("customerCard")}
            </Link>
          ) : null}
          <p className="mt-2 text-sm">
            {c.requestCode ? `${t("request")}: ${c.requestCode}` : ""}
            {c.intermediary ? ` · ${t("intermediary")}: ${c.intermediary}` : ""}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm">{c.description}</p>
        </Card>

        <Card>
          <CardTitle>{t("answer")}</CardTitle>
          {c.status === "ANSWERED" ? (
            <>
              <p className="mt-2 text-sm text-warm-600">
                {t(`outcomes.${c.outcome ?? "REJECTED"}`)}
                {c.answeredAt ? ` · ${formatDateTime(c.answeredAt)}` : ""}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm">{c.responseText}</p>
            </>
          ) : (
            <form action={answerComplaint} className="mt-3 grid gap-3 text-sm">
              <input type="hidden" name="id" value={c.id} />
              <label className="grid gap-1">
                {t("outcome")}
                <select name="outcome" className={field}>
                  {(["ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED"] as const).map((o) => (
                    <option key={o} value={o}>
                      {t(`outcomes.${o}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                {t("responseText")}
                <textarea name="responseText" required minLength={10} rows={8} className={field} />
              </label>
              <p className="text-xs text-warm-600">{t("ivassHint")}</p>
              <Button type="submit" className="justify-self-start">
                {t("send")}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

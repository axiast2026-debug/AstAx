import { formatDate } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary, Field } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { fileComplaint } from "./actions";

interface Complaint {
  id: string;
  protocol: string;
  subject: string;
  receivedAt: string;
  dueAt: string;
  status: "OPEN" | "ANSWERED";
  responseText: string | null;
  outcome: "ACCEPTED" | "PARTIALLY_ACCEPTED" | "REJECTED" | null;
}

/**
 * «Reclami» (spec 03): the formal complaint with its protocol, the answer
 * within the legal term, and how to turn to IVASS if it does not satisfy.
 */
export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; protocollo?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("complaints");
  const query = await searchParams;
  const { status, body } = await api<Complaint[]>("/me/complaints");
  if (status !== 200) notFound();

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-warm-600">{t("intro")}</p>
      <div className="mt-6">
        <ErrorSummary codes={query.errore} />
      </div>
      {query.protocollo ? (
        <p role="status" className="mb-6 rounded-lg bg-green-50 p-3 text-sm">
          {t("filed", { protocol: query.protocollo })}
        </p>
      ) : null}
      <div className="space-y-4">
        {body.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle>
                {c.protocol} · {c.subject}
              </CardTitle>
              <Badge tone={c.status === "ANSWERED" ? "success" : "warning"}>
                {t(`status.${c.status}`)}
              </Badge>
            </div>
            <p className="text-sm text-warm-600">
              {t("dates", { received: formatDate(c.receivedAt), due: formatDate(c.dueAt) })}
            </p>
            {c.responseText ? (
              <>
                <p className="mt-3 text-sm font-medium">
                  {t(`outcomes.${c.outcome ?? "REJECTED"}`)}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{c.responseText}</p>
                <p className="mt-3 text-xs text-warm-600">{t("ivass")}</p>
              </>
            ) : null}
          </Card>
        ))}
      </div>
      <Card className="mt-8">
        <CardTitle>{t("new")}</CardTitle>
        <form action={fileComplaint} className="mt-4 space-y-4">
          <Field label={t("subject")} name="subject" required minLength={3} maxLength={200} />
          <div>
            <label htmlFor="description" className="block text-sm font-medium">
              {t("description")}
            </label>
            <textarea
              id="description"
              name="description"
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              className="mt-1 w-full rounded-lg border border-warm-200 px-3 py-2 text-sm"
            />
          </div>
          <Field label={t("requestCode")} name="requestCode" hint={t("requestCodeHint")} />
          <Button type="submit">{t("send")}</Button>
        </form>
      </Card>
    </AppShell>
  );
}

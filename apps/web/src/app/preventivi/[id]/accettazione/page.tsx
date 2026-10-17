import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { goToSignature, payAcceptance } from "@/app/acceptance-actions";
import { realtimeTicket } from "@/app/actions";
import { AcceptanceSteps } from "@/components/acceptance-steps";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary } from "@/components/form";
import { LiveRefresh } from "@/components/live-refresh";
import type { CurrentAcceptance, Presentation } from "@/lib/acceptance";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { requestDetail } from "@/lib/requests";

/** The private user's acceptance (spec 03): the four steps of AcceptanceSteps. */
export default async function AcceptancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; esito?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.me.kind !== "PRIVATE") notFound();
  const { id } = await params;
  const query = await searchParams;
  const t = await getTranslations("acceptance");
  const detail = await requestDetail(id);
  const [{ body: current }, { body: presentation }] = await Promise.all([
    api<CurrentAcceptance>(`/requests/${id}/acceptance`),
    api<Presentation>(`/requests/${id}/presentation`),
  ]);
  const a = current.acceptance;
  const row = a ? presentation.offers.find((o) => o.id === a.offerId) : undefined;
  const back = (
    <Link href={`/preventivi/${id}#offerte`} className="text-sm underline">
      {t("back")}
    </Link>
  );
  if (!a || !row) {
    return (
      <AppShell viewer={viewer}>
        <Card>
          <CardTitle>{t("title", { code: detail.code })}</CardTitle>
          <p className="mt-2 text-sm">{t("notStarted")}</p>
          <div className="mt-4">{back}</div>
        </Card>
      </AppShell>
    );
  }
  const pending = a.status !== "PAID" && a.payment?.status === "AUTHORIZED";
  return (
    <AppShell viewer={viewer}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("title", { code: detail.code })}</h1>
          {back}
        </div>
        <ErrorSummary codes={query.errore} />
        {pending ? <LiveRefresh ticket={realtimeTicket} follow={{ requestId: id }} /> : null}
        <AcceptanceSteps
          acceptance={a}
          row={row}
          issuer={current.issuer}
          documentBase={`/preventivi/${id}/accettazione/documenti`}
          changeHref={`/preventivi/${id}#offerte`}
          hidden={{ requestId: id }}
          signAction={goToSignature}
          payAction={payAcceptance}
          esito={query.esito}
        />
      </div>
    </AppShell>
  );
}

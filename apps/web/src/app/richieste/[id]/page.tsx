import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RequestView } from "@/components/request-view";
import { requireViewer } from "@/lib/me";
import { BROKER_STEPS, requestDetail } from "@/lib/requests";
import { resumeStep } from "@/lib/resume";

export default async function BrokerRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; inviata?: string }>;
}) {
  const viewer = await requireViewer();
  const detail = await requestDetail((await params).id);
  const query = await searchParams;
  // A draft goes on where it stopped (UX review 2026-10-23). A draft of a lot
  // (ADR 0014) keeps its page: it leaves by itself on its day.
  if (detail.status === "DRAFT" && !query.errore && !detail.scheduledSubmitAt) {
    redirect(`/richieste/${detail.id}/${resumeStep(detail.draft)}`);
  }
  return (
    <AppShell viewer={viewer}>
      <RequestView
        detail={detail}
        base="/richieste"
        steps={BROKER_STEPS}
        errors={query.errore}
        justSubmitted={query.inviata === "1"}
      />
    </AppShell>
  );
}

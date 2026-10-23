import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RequestView } from "@/components/request-view";
import { requireViewer } from "@/lib/me";
import { PRIVATE_STEPS, requestDetail } from "@/lib/requests";
import { resumeStep } from "@/lib/resume";

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; inviata?: string }>;
}) {
  const viewer = await requireViewer();
  const detail = await requestDetail((await params).id);
  const query = await searchParams;
  // A draft goes on where it stopped (UX review 2026-10-23), not to a page that only says «continua».
  if (detail.status === "DRAFT" && !query.errore) {
    redirect(`/preventivi/${detail.id}/${resumeStep(detail.draft)}`);
  }
  return (
    <AppShell viewer={viewer}>
      <RequestView
        detail={detail}
        base="/preventivi"
        steps={PRIVATE_STEPS}
        errors={query.errore}
        justSubmitted={query.inviata === "1"}
      />
    </AppShell>
  );
}

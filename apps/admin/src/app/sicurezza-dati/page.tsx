import { RetentionCard } from "@/components/retention-card";
import { SettingsPanel } from "@/components/settings-panel";

/** Spec 07: the parameters of this page of the administrator's panel, and the retention. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    errore?: string;
    fatto?: string;
    chiave?: string;
    storico?: string;
    cancellate?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <SettingsPanel page="system" query={query}>
      <RetentionCard purged={query.cancellate} />
    </SettingsPanel>
  );
}

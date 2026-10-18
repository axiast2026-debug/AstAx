import { SettingsPanel } from "@/components/settings-panel";

/** Spec 07: the parameters of this page of the administrator's panel. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string; chiave?: string; storico?: string }>;
}) {
  return <SettingsPanel page="auctionRules" query={await searchParams} />;
}

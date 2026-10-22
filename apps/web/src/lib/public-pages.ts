import "server-only";
import type { PublicHomeData } from "@/components/public-home";
import { publicApi } from "./public-api";

/**
 * The numbers of the public pages (Come funziona, Per le agenzie, Domande
 * frequenti): fees and service promises from the parameters (rule 7), read
 * from the public home data (ADR 0016). Without them the page shows its error.
 */
export async function publicNumbers(): Promise<PublicHomeData> {
  const { status, body } = await publicApi<PublicHomeData>("/public/home");
  if (status !== 200 || !body) throw new Error(`public data unavailable (${status})`);
  return body;
}

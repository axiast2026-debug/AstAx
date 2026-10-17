import { redirect } from "next/navigation";
import { tokenOfLink } from "@/lib/customer-link";

/**
 * Back from the signature or payment provider: the address carries the
 * link's id only; the token is in the cookie of the browser that confirmed
 * the code. Another browser lands on the home page.
 */
export async function GET(request: Request, context: { params: Promise<{ linkId: string }> }) {
  const token = await tokenOfLink((await context.params).linkId);
  if (!token) redirect("/");
  const esito = new URL(request.url).searchParams.get("esito");
  redirect(
    esito && /^[a-z]{3,12}$/.test(esito) ? `/offerta/${token}?esito=${esito}` : `/offerta/${token}`,
  );
}

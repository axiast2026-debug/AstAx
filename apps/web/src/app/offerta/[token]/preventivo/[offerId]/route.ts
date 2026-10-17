import { linkFile } from "@/lib/customer-link";

/** PRES-04: the PDF quote of an offer the broker sent. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; offerId: string }> },
) {
  const { token, offerId } = await context.params;
  return linkFile(`/customer-links/${token}/offers/${offerId}/quote`);
}

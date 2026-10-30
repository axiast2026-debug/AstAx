import { companyLogoResponse } from "@astax/ui/server";
import { loadEnv } from "@astax/shared/env";

loadEnv(process.cwd());

/** The logo of a company, or the neutral placeholder (ADR 0028). Not personal data. */
export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await context.params;
  return companyLogoResponse(process.env.API_URL ?? "", companyId);
}

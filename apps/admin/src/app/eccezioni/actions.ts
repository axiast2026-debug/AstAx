"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const uuid = /^[0-9a-f-]{36}$/i;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
}

/** EMI-04: the fault of a missed issuance; for the customer's data, the agency's new price. */
export async function decideIssuanceProblem(formData: FormData): Promise<void> {
  const id = String(formData.get("problemId") ?? "");
  if (!uuid.test(id)) redirect("/eccezioni");
  const fault = formData.get("fault") === "CUSTOMER" ? "CUSTOMER" : "AGENCY";
  const euros = String(formData.get("newPremium") ?? "").trim();
  // Whole cents from «505,00» without floating point (rule 5).
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(euros);
  const newPremiumCents = match
    ? Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"))
    : undefined;
  const { status, body } = await api(`/back-office/issuance-problems/${id}/decide`, {
    method: "POST",
    body: JSON.stringify({
      fault,
      reason: String(formData.get("reason") ?? ""),
      ...(fault === "CUSTOMER" && newPremiumCents ? { newPremiumCents } : {}),
    }),
  });
  revalidatePath("/eccezioni");
  if (status !== 200) redirect(`/eccezioni?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/eccezioni?fatto=1");
}

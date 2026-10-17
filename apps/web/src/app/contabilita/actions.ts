"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

/** EMI-05: the agency contests an applied penalty within the time; the API checks it. */
export async function contestPenalty(formData: FormData): Promise<void> {
  const id = String(formData.get("penaltyId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/contabilita");
  const { status, body } = await api(`/agency/penalties/${id}/contest`, {
    method: "POST",
    body: JSON.stringify({ text: String(formData.get("text") ?? "") }),
  });
  revalidatePath("/contabilita");
  if (status !== 200) {
    const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
    redirect(
      `/contabilita?errore=${encodeURIComponent(problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL")}`,
    );
  }
  redirect("/contabilita?fatto=1");
}

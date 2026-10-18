"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/;
const KINDS = ["ACCESS", "RECTIFICATION", "ERASURE"];

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

/** A request about personal data, as received (spec 06 «Clienti»). */
export async function openDataRequest(formData: FormData): Promise<void> {
  const id = String(formData.get("customerId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!ID.test(id) || !KINDS.includes(kind)) redirect("/clienti");
  const { status, body } = await api(`/back-office/customers/${id}/data-requests`, {
    method: "POST",
    body: JSON.stringify({
      kind,
      description: String(formData.get("description") ?? ""),
      receivedOn: String(formData.get("receivedOn") ?? ""),
    }),
  });
  revalidatePath(`/clienti/${id}`);
  if (status !== 201) redirect(`/clienti/${id}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/clienti/${id}?fatto=aperta`);
}

export async function closeDataRequest(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  if (!ID.test(id) || !ID.test(customerId)) redirect("/clienti");
  const { status, body } = await api(`/back-office/data-requests/${id}/close`, {
    method: "POST",
    body: JSON.stringify({
      done: formData.get("outcomeKind") === "done",
      outcome: String(formData.get("outcome") ?? ""),
    }),
  });
  revalidatePath(`/clienti/${customerId}`);
  if (status !== 200)
    redirect(`/clienti/${customerId}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/clienti/${customerId}?fatto=chiusa`);
}

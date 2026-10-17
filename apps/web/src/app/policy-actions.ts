"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { euroToCents } from "@/lib/agency";
import { api } from "@/lib/auth";

/**
 * Process 10 and S08: the renewals and the withdrawal. «Rinnova in asta» opens the draft already filled
 * (only the new risk certificate is missing); the broker switches the
 * automatic renewal and starts the renewals of a month. The API checks every
 * rule again; errors come back as codes.
 */
const uuid = /^[0-9a-f-]{36}$/i;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
}

export async function renewPolicy(formData: FormData): Promise<void> {
  const id = String(formData.get("policyId") ?? "");
  const back = String(formData.get("back") ?? "/polizze") === "/rinnovi" ? "/rinnovi" : "/polizze";
  const base = String(formData.get("base") ?? "") === "/richieste" ? "/richieste" : "/preventivi";
  if (!uuid.test(id)) redirect(back);
  const { status, body } = await api<{ requestId: string }>(`/policies/${id}/renew`, {
    method: "POST",
    body: "{}",
  });
  if (status !== 201) redirect(`${back}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`${base}/${body.requestId}`);
}

export async function setAutoRenewal(formData: FormData): Promise<void> {
  const id = String(formData.get("policyId") ?? "");
  if (!uuid.test(id)) redirect("/rinnovi");
  const { status, body } = await api(`/policies/${id}/auto-renewal`, {
    method: "POST",
    body: JSON.stringify({ enabled: formData.get("enabled") === "true" }),
  });
  revalidatePath("/rinnovi");
  if (status !== 200) redirect(`/rinnovi?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/rinnovi");
}

export async function renewMonth(formData: FormData): Promise<void> {
  const period = String(formData.get("period") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) redirect("/rinnovi");
  const { status, body } = await api<{ created: number }>("/broker/renewals/bulk", {
    method: "POST",
    body: JSON.stringify({ period }),
  });
  revalidatePath("/rinnovi");
  if (status !== 200) redirect(`/rinnovi?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/rinnovi?preparati=${body.created}`);
}

/** S08: the customer asks for the withdrawal; the agency prices it, the supervisor approves. */
export async function requestWithdrawal(formData: FormData): Promise<void> {
  const id = String(formData.get("policyId") ?? "");
  if (!uuid.test(id)) redirect("/polizze");
  const { status, body } = await api(`/policies/${id}/withdrawal`, { method: "POST", body: "{}" });
  revalidatePath("/polizze");
  if (status !== 201) redirect(`/polizze?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/polizze?recesso=1");
}

/** PAG-04: the refundable premium under the company terms, in euro with cents. */
export async function priceWithdrawal(formData: FormData): Promise<void> {
  const id = String(formData.get("withdrawalId") ?? "");
  const refundableCents = euroToCents(String(formData.get("refundable") ?? ""));
  if (!uuid.test(id) || refundableCents === null) redirect("/polizze?errore=VALIDATION_FAILED");
  const { status, body } = await api(`/agency/withdrawals/${id}/price`, {
    method: "POST",
    body: JSON.stringify({ refundableCents }),
  });
  revalidatePath("/polizze");
  if (status !== 200) redirect(`/polizze?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/polizze?prezzato=1");
}

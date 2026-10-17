"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const uuid = /^[0-9a-f-]{36}$/i;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
}

function idOf(formData: FormData): string {
  const id = String(formData.get("refundId") ?? "");
  if (!uuid.test(id)) redirect("/pagamenti");
  return id;
}

/** PAG-05: only the supervisor approves; the API checks it. */
export async function approveRefund(formData: FormData): Promise<void> {
  const { status, body } = await api(`/back-office/refunds/${idOf(formData)}/approve`, {
    method: "POST",
    body: "{}",
  });
  revalidatePath("/pagamenti");
  if (status !== 200) redirect(`/pagamenti?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/pagamenti?fatto=1");
}

export async function rejectRefund(formData: FormData): Promise<void> {
  const { status, body } = await api(`/back-office/refunds/${idOf(formData)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: String(formData.get("reason") ?? "") }),
  });
  revalidatePath("/pagamenti");
  if (status !== 200) redirect(`/pagamenti?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/pagamenti?fatto=1");
}

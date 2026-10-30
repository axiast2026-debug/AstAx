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

async function post(path: string, body: object = {}): Promise<never> {
  const { status, body: answer } = await api(path, { method: "POST", body: JSON.stringify(body) });
  revalidatePath("/pagamenti");
  if (status >= 300) redirect(`/pagamenti?errore=${encodeURIComponent(codesOf(answer))}`);
  redirect("/pagamenti?fatto=1#rimesse");
}

function remittanceId(formData: FormData): string {
  const id = String(formData.get("remittanceId") ?? "");
  if (!uuid.test(id)) redirect("/pagamenti");
  return id;
}

/** CONT-01: what the Monday schedule does, now. */
export async function prepareRemittances(): Promise<void> {
  await post("/back-office/remittances/prepare");
}

export async function reviewRemittance(formData: FormData): Promise<void> {
  await post(`/back-office/remittances/${remittanceId(formData)}/review`);
}

/** CONT-02: one SEPA file for the reviewed remittances of a run day. */
export async function generateSepaFile(formData: FormData): Promise<void> {
  const runDate = String(formData.get("runDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) redirect("/pagamenti");
  await post("/back-office/remittances/file", { runDate });
}

export async function executeRemittance(formData: FormData): Promise<void> {
  await post(`/back-office/remittances/${remittanceId(formData)}/execute`);
}

/** «12,50» or «12.5» in integer cents (rule 5); null when it is not an amount. */
function toCents(value: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** Audit of 2026-10-30 (A4): a refund asked by hand; the supervisor approves it. */
export async function requestRefund(formData: FormData): Promise<void> {
  const premiumCents = toCents(String(formData.get("premium") ?? "0") || "0");
  const feeCents = toCents(String(formData.get("fee") ?? "0") || "0");
  if (premiumCents === null || feeCents === null) redirect("/pagamenti?errore=INVALID_AMOUNT");
  const { status, body } = await api(`/back-office/refunds`, {
    method: "POST",
    body: JSON.stringify({
      requestCode: String(formData.get("requestCode") ?? "").trim(),
      reason: String(formData.get("reason") ?? ""),
      premiumCents,
      feeCents,
      note: String(formData.get("note") ?? "").trim(),
    }),
  });
  revalidatePath("/pagamenti");
  if (status !== 201) redirect(`/pagamenti?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/pagamenti?fatto=1");
}

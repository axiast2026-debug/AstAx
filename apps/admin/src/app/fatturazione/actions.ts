"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const uuid = /^[0-9a-f-]{36}$/i;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
}

const text = (formData: FormData, name: string) =>
  String(formData.get(name) ?? "")
    .trim()
    .toUpperCase();

/** Proposal D of phase 6: the fiscal data of the recipient, then the invoice goes to SDI. */
export async function completeRecipient(formData: FormData): Promise<void> {
  const id = String(formData.get("invoiceId") ?? "");
  if (!uuid.test(id)) redirect("/fatturazione");
  const fiscalCode = text(formData, "fiscalCode");
  const vatNumber = text(formData, "vatNumber");
  const { status, body } = await api(`/back-office/invoices/${id}/recipient`, {
    method: "POST",
    body: JSON.stringify({
      ...(fiscalCode ? { fiscalCode } : {}),
      ...(vatNumber ? { vatNumber } : {}),
      address: {
        street: String(formData.get("street") ?? "").trim(),
        postalCode: text(formData, "postalCode"),
        municipalityIstat: text(formData, "municipalityIstat"),
        province: text(formData, "province"),
      },
    }),
  });
  revalidatePath("/fatturazione");
  if (status !== 200) redirect(`/fatturazione?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/fatturazione?fatto=1");
}

/** Decision 24: the brokers' invoices of a month, as the schedule of the first day does. */
export async function issueBrokerMonth(formData: FormData): Promise<void> {
  const period = String(formData.get("period") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) redirect("/fatturazione");
  const { status, body } = await api("/back-office/invoices/broker-month", {
    method: "POST",
    body: JSON.stringify({ period }),
  });
  revalidatePath("/fatturazione");
  if (status !== 200) redirect(`/fatturazione?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/fatturazione?fatto=1");
}

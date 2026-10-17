"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

/** EMI-05, EMI-06: penalties and suspensions; the API checks the role of each step. */
const uuid = /^[0-9a-f-]{36}$/i;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
}

async function send(back: string, path: string, payload: unknown): Promise<never> {
  const { status, body } = await api(path, { method: "POST", body: JSON.stringify(payload) });
  revalidatePath(back);
  if (status !== 200) redirect(`${back}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`${back}?fatto=1`);
}

const idOf = (formData: FormData, back: string) => {
  const id = String(formData.get("id") ?? "");
  if (!uuid.test(id)) redirect(back);
  return id;
};

export async function applyPenalty(formData: FormData): Promise<void> {
  await send("/eccezioni", `/back-office/penalties/${idOf(formData, "/eccezioni")}/apply`, {});
}

export async function cancelPenalty(formData: FormData): Promise<void> {
  await send("/eccezioni", `/back-office/penalties/${idOf(formData, "/eccezioni")}/cancel`, {
    reason: String(formData.get("reason") ?? ""),
  });
}

export async function decideContest(formData: FormData): Promise<void> {
  await send("/organizzazioni", `/admin/penalties/${idOf(formData, "/organizzazioni")}/decide`, {
    outcome: formData.get("outcome") === "CANCELLED" ? "CANCELLED" : "UPHELD",
    decision: String(formData.get("decision") ?? ""),
  });
}

export async function decideSuspension(formData: FormData): Promise<void> {
  await send("/organizzazioni", `/admin/suspensions/${idOf(formData, "/organizzazioni")}/decide`, {
    outcome: formData.get("outcome") === "REVOKE" ? "REVOKE" : "CONFIRM",
    reason: String(formData.get("reason") ?? ""),
  });
}

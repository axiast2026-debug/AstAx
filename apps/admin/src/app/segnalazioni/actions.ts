"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const uuid = /^[0-9a-f-]{36}$/i;
const STATUSES = ["ARCHIVED", "PENALTY_PROPOSED", "SUSPENSION_PROPOSED"];

/** Spec 06 «Segnalazioni»: the outcome of a flag, with the reason (in the audit log). */
export async function decideFlag(formData: FormData): Promise<void> {
  const id = String(formData.get("flagId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!uuid.test(id) || !STATUSES.includes(status)) redirect("/segnalazioni");
  const { status: code } = await api(`/back-office/flags/${id}/decide`, {
    method: "POST",
    body: JSON.stringify({ status, outcome: String(formData.get("outcome") ?? "") }),
  });
  revalidatePath("/segnalazioni");
  redirect(code === 200 ? "/segnalazioni?fatto=1" : "/segnalazioni?errore=1");
}

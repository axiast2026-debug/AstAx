"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

/** Spec 06 «Coda di ingresso»: approve or reject, always with a reason. */
export async function decideOnboarding(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  if (!ID.test(id) || (outcome !== "approve" && outcome !== "reject")) redirect("/ingressi");
  const { status, body } = await api(`/bo/onboarding/${id}/${outcome}`, {
    method: "POST",
    body: JSON.stringify({ reason: String(formData.get("reason") ?? "") }),
  });
  revalidatePath("/ingressi");
  if (status !== 200) redirect(`/ingressi/${id}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/ingressi?fatto=${outcome}`);
}

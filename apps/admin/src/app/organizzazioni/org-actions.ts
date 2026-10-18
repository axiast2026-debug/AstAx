"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

/** Spec 06 «Agenzie e broker»: suspend, reactivate, note, exclusion proposal. */
export async function organizationStep(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const step = String(formData.get("step") ?? "");
  if (!ID.test(id)) redirect("/organizzazioni");
  const text = String(formData.get("text") ?? "");
  const call =
    step === "suspend" || step === "reactivate"
      ? api(`/back-office/organizations/${id}/${step}`, {
          method: "POST",
          body: JSON.stringify({ reason: text }),
        })
      : step === "NOTE" || step === "EXCLUSION_PROPOSAL"
        ? api(`/back-office/organizations/${id}/notes`, {
            method: "POST",
            body: JSON.stringify({ kind: step, text }),
          })
        : null;
  if (!call) redirect(`/organizzazioni/${id}`);
  const { status, body } = await call;
  revalidatePath(`/organizzazioni/${id}`);
  if (status !== 200 && status !== 201) {
    redirect(`/organizzazioni/${id}?errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(`/organizzazioni/${id}?fatto=${step}`);
}

/** Spec 07: the administrator accepts or rejects an exclusion proposal. */
export async function decideExclusion(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!ID.test(id)) redirect("/organizzazioni");
  const { status, body } = await api(`/admin/exclusion-proposals/${id}/decide`, {
    method: "POST",
    body: JSON.stringify({
      accept: formData.get("outcome") === "accept",
      reason: String(formData.get("reason") ?? ""),
    }),
  });
  revalidatePath("/organizzazioni");
  if (status !== 200) redirect(`/organizzazioni?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/organizzazioni?fatto=1");
}

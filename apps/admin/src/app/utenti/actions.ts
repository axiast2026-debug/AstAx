"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/;
const STEPS = ["block", "unblock", "reset-second-factor"] as const;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

/** Back to the list with the same search, and the outcome. */
function back(formData: FormData, outcome: string): never {
  const params = new URLSearchParams();
  const q = String(formData.get("q") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (q) params.set("q", q);
  if (kind) params.set("tipo", kind);
  const [key, value] = outcome.split("=") as [string, string];
  params.set(key, value);
  redirect(`/utenti?${params.toString()}`);
}

/** Block, unblock or reset the second factor, with the reason. */
export async function userStep(formData: FormData): Promise<void> {
  const id = String(formData.get("userId") ?? "");
  const step = String(formData.get("step") ?? "") as (typeof STEPS)[number];
  if (!ID.test(id) || !STEPS.includes(step)) redirect("/utenti");
  const { status, body } = await api(`/admin/users/${id}/${step}`, {
    method: "POST",
    body: JSON.stringify({ reason: String(formData.get("reason") ?? "") }),
  });
  revalidatePath("/utenti");
  if (status !== 200) back(formData, `errore=${encodeURIComponent(codesOf(body))}`);
  back(formData, `fatto=${step}`);
}

/** A back office role, or none. */
export async function staffRole(formData: FormData): Promise<void> {
  const id = String(formData.get("userId") ?? "");
  if (!ID.test(id)) redirect("/utenti");
  const role = String(formData.get("role") ?? "");
  const { status, body } = await api(`/admin/users/${id}/staff-role`, {
    method: "PUT",
    body: JSON.stringify({
      role: role === "" ? null : role,
      reason: String(formData.get("reason") ?? ""),
    }),
  });
  revalidatePath("/utenti");
  if (status !== 200) back(formData, `errore=${encodeURIComponent(codesOf(body))}`);
  back(formData, "fatto=role");
}

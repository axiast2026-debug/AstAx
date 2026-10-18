"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, sessionId, webAuth } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/;
const STEPS = ["block", "unblock", "reset-second-factor"] as const;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

/** Back to the list, with the outcome (the search stays in the session). */
function back(_formData: FormData, outcome: string): never {
  const [key, value] = outcome.split("=") as [string, string];
  redirect(`/utenti?${new URLSearchParams({ [key]: value }).toString()}`);
}

/** Rule 8: the search stays in the server session, never in the URL. */
export async function searchUsers(formData: FormData): Promise<void> {
  const q = String(formData.get("q") ?? "")
    .trim()
    .slice(0, 120);
  const kind = String(formData.get("tipo") ?? "");
  await webAuth().setSearch(await sessionId(), "admin-users", { q, kind });
  revalidatePath("/utenti");
  redirect("/utenti");
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

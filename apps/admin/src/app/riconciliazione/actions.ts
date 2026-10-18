"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

/** The statement of the separate account, CSV or camt.053 (proposal C). */
export async function importStatement(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/riconciliazione?errore=FILE_REQUIRED");
  const { status, body } = await api<{ matched?: number; unmatched?: number }>(
    `/back-office/reconciliation/statements?fileName=${encodeURIComponent(file.name.slice(0, 200))}`,
    {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: new Uint8Array(await file.arrayBuffer()),
    },
  );
  revalidatePath("/riconciliazione");
  if (status !== 201) redirect(`/riconciliazione?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/riconciliazione?abbinate=${body.matched ?? 0}&coda=${body.unmatched ?? 0}`);
}

export async function lineStep(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const step = String(formData.get("step") ?? "");
  if (!ID.test(id) || !["match", "ignore", "reopen"].includes(step)) redirect("/riconciliazione");
  const paymentId = String(formData.get("paymentId") ?? "");
  const note = String(formData.get("note") ?? "");
  const { status, body } = await api(`/back-office/reconciliation/lines/${id}/${step}`, {
    method: "POST",
    body: JSON.stringify(step === "match" ? { paymentId, note } : { note }),
  });
  revalidatePath("/riconciliazione");
  if (status !== 200) redirect(`/riconciliazione?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/riconciliazione?fatto=1");
}

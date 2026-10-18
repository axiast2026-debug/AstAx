"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.length
    ? problem.errors.map((e) => e.issue).join(",")
    : (problem.code ?? "INTERNAL");
}

/** Spec 03: the formal complaint from the own area. */
export async function fileComplaint(formData: FormData): Promise<void> {
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  const { status, body } = await api<{ protocol: string }>("/me/complaints", {
    method: "POST",
    body: JSON.stringify({
      subject: value("subject"),
      description: value("description"),
      requestCode: value("requestCode") || null,
    }),
  });
  revalidatePath("/reclami");
  if (status !== 201) redirect(`/reclami?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/reclami?protocollo=${encodeURIComponent(body.protocol)}`);
}

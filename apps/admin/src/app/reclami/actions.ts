"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

/** A complaint received by email, PEC, post or phone (spec 06 «Reclami»). */
export async function registerComplaint(formData: FormData): Promise<void> {
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  const { status, body } = await api<{ id: string; protocol: string }>("/back-office/complaints", {
    method: "POST",
    body: JSON.stringify({
      channel: value("channel"),
      receivedOn: value("receivedOn"),
      complainantName: value("complainantName"),
      complainantEmail: value("complainantEmail") || null,
      subject: value("subject"),
      description: value("description"),
      requestCode: value("requestCode") || null,
    }),
  });
  revalidatePath("/reclami");
  if (status !== 201) redirect(`/reclami?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/reclami?protocollo=${encodeURIComponent(body.protocol)}`);
}

export async function answerComplaint(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!ID.test(id)) redirect("/reclami");
  const { status, body } = await api(`/back-office/complaints/${id}/answer`, {
    method: "POST",
    body: JSON.stringify({
      responseText: String(formData.get("responseText") ?? ""),
      outcome: String(formData.get("outcome") ?? ""),
    }),
  });
  revalidatePath(`/reclami/${id}`);
  if (status !== 200) redirect(`/reclami/${id}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/reclami/${id}?fatto=1`);
}

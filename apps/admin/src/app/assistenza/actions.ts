"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

/** Spec 06 «Assistenza»: a new ticket, as received. */
export async function openTicket(formData: FormData): Promise<void> {
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  const customerId = value("customerId");
  const { status, body } = await api<{ id: string }>("/back-office/tickets", {
    method: "POST",
    body: JSON.stringify({
      subject: value("subject"),
      channel: value("channel"),
      text: value("text"),
      contactEmail: value("contactEmail") || null,
      locale: value("locale") === "sq" ? "sq" : "it",
      customerId: ID.test(customerId) ? customerId : null,
      requestCode: value("requestCode") || null,
    }),
  });
  if (status !== 201) redirect(`/assistenza?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/assistenza/${body.id}`);
}

export async function ticketStep(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const step = String(formData.get("step") ?? "");
  if (!ID.test(id)) redirect("/assistenza");
  const text = String(formData.get("text") ?? "");
  const call =
    step === "REPLY" || step === "NOTE"
      ? api(`/back-office/tickets/${id}/messages`, {
          method: "POST",
          body: JSON.stringify({ kind: step, text }),
        })
      : step === "assign"
        ? api(`/back-office/tickets/${id}/assign`, { method: "POST", body: "{}" })
        : ["OPEN", "WAITING_CUSTOMER", "CLOSED"].includes(step)
          ? api(`/back-office/tickets/${id}/status`, {
              method: "POST",
              body: JSON.stringify({ status: step }),
            })
          : null;
  if (!call) redirect(`/assistenza/${id}`);
  const { status, body } = await call;
  revalidatePath(`/assistenza/${id}`);
  if (status !== 200 && status !== 201) {
    redirect(`/assistenza/${id}?errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(`/assistenza/${id}?fatto=1`);
}

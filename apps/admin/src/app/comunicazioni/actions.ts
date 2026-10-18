"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const KEY = /^[a-z_.]+$/;
const FIELDS = ["title", "body", "emailSubject", "emailBody", "sms"] as const;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

function textsOf(formData: FormData, locale: "it" | "sq") {
  const out: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = String(formData.get(`${locale}.${f}`) ?? "");
    if (v.trim()) out[f] = v.replace(/\r\n/g, "\n");
  }
  return out;
}

/** Spec 07: a new version of the texts of an event, with the reason. */
export async function saveTemplate(formData: FormData): Promise<void> {
  const key = String(formData.get("eventKey") ?? "");
  if (!KEY.test(key)) redirect("/comunicazioni");
  const sq = textsOf(formData, "sq");
  const { status, body } = await api(`/admin/notification-templates/${key}`, {
    method: "PUT",
    body: JSON.stringify({
      it: textsOf(formData, "it"),
      sq: Object.keys(sq).length > 0 ? sq : null,
      reason: String(formData.get("reason") ?? ""),
    }),
  });
  revalidatePath("/comunicazioni");
  if (status !== 200) {
    redirect(`/comunicazioni?evento=${key}&errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(`/comunicazioni?evento=${key}&fatto=salvato`);
}

export async function testTemplate(formData: FormData): Promise<void> {
  const key = String(formData.get("eventKey") ?? "");
  if (!KEY.test(key)) redirect("/comunicazioni");
  const { status, body } = await api(`/admin/notification-templates/${key}/test`, {
    method: "POST",
    body: "{}",
  });
  if (status !== 200) {
    redirect(`/comunicazioni?evento=${key}&errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(`/comunicazioni?evento=${key}&fatto=prova`);
}

/** A message to a group of users, in the app and by email. */
export async function broadcast(formData: FormData): Promise<void> {
  const { status, body } = await api<{ recipients: number }>("/admin/communications", {
    method: "POST",
    body: JSON.stringify({
      group: String(formData.get("group") ?? ""),
      title: String(formData.get("title") ?? ""),
      text: String(formData.get("text") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    }),
  });
  if (status !== 201) redirect(`/comunicazioni?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/comunicazioni?inviati=${body.recipients}`);
}

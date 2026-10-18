"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const KEY = /^[a-z-]+$/;
const ID = /^[0-9a-f-]{36}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

function done(key: string, status: number, expected: number, body: unknown, outcome: string) {
  revalidatePath("/documenti-legali");
  if (status !== expected) {
    redirect(`/documenti-legali?documento=${key}&errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(`/documenti-legali?documento=${key}&fatto=${outcome}`);
}

/** A new version as a draft: in force only once published (LEG-02). */
export async function newVersion(formData: FormData): Promise<void> {
  const key = String(formData.get("key") ?? "");
  if (!KEY.test(key)) redirect("/documenti-legali");
  const { status, body } = await api(`/admin/legal/documents/${key}/versions`, {
    method: "POST",
    body: JSON.stringify({
      contentMd: String(formData.get("contentMd") ?? "").replace(/\r\n/g, "\n"),
      reason: String(formData.get("reason") ?? ""),
    }),
  });
  done(key, status, 201, body, "draft");
}

/** Validated by the lawyer (LEG-03), or published, with the reason. */
export async function versionStep(formData: FormData): Promise<void> {
  const key = String(formData.get("key") ?? "");
  const id = String(formData.get("versionId") ?? "");
  const step = String(formData.get("step") ?? "");
  if (!KEY.test(key) || !ID.test(id) || (step !== "validate" && step !== "publish")) {
    redirect("/documenti-legali");
  }
  const reason = String(formData.get("reason") ?? "");
  const { status, body } = await api(`/admin/legal/versions/${id}/${step}`, {
    method: "POST",
    body: JSON.stringify(
      step === "publish" ? { reason, summary: String(formData.get("summary") ?? "") } : { reason },
    ),
  });
  done(key, status, step === "publish" ? 200 : 201, body, step);
}

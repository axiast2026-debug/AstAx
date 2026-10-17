"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

/** PRES-07: one value per company and year; the API checks the role and logs the change. */
export async function setComplaintsIndex(formData: FormData): Promise<void> {
  const companyId = String(formData.get("companyId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) redirect("/indice-reclami");
  const value = Number(String(formData.get("value") ?? "").replace(",", "."));
  const { status, body } = await api("/admin/complaints-index", {
    method: "PUT",
    body: JSON.stringify({
      companyId,
      year: Number(formData.get("year")),
      value,
      source: String(formData.get("source") ?? ""),
    }),
  });
  if (status !== 200) {
    const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
    const code = problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
    redirect(`/indice-reclami?errore=${encodeURIComponent(code)}`);
  }
  redirect("/indice-reclami?fatto=1");
}

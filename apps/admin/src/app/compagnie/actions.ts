"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const ID = /^[0-9a-f-]{36}$/i;

/** ADR 0028: uploads or replaces a company's logo; the API checks the file and logs the change. */
export async function setCompanyLogo(formData: FormData): Promise<void> {
  const companyId = String(formData.get("companyId") ?? "");
  if (!ID.test(companyId)) redirect("/compagnie");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/compagnie?errore=FILE_REQUIRED");
  const { status, body } = await api(`/admin/companies/${companyId}/logo`, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: new Uint8Array(await file.arrayBuffer()),
  });
  if (status !== 200) {
    const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
    const code = problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
    redirect(`/compagnie?errore=${encodeURIComponent(code)}`);
  }
  revalidatePath("/compagnie");
  redirect("/compagnie?fatto=1");
}

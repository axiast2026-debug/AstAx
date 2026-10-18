"use server";

import { romeInstant } from "@astax/shared/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const CODE = /^[A-Z][A-Z0-9_]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

function outcome(status: number, expected: number, body: unknown, done: string): never {
  revalidatePath("/pacchetti");
  if (status !== expected) redirect(`/pacchetti?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/pacchetti?fatto=${done}`);
}

/** A new version of a package from a date (Rome midnight). */
export async function newPackageVersion(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  const day = String(formData.get("validFrom") ?? "");
  if (!CODE.test(code)) redirect("/pacchetti");
  if (!DAY.test(day)) redirect("/pacchetti?errore=INVALID_DATE");
  let requirements: unknown;
  try {
    requirements = JSON.parse(String(formData.get("requirements") ?? ""));
  } catch {
    redirect("/pacchetti?errore=INVALID_JSON");
  }
  const sq = String(formData.get("customerTextSq") ?? "").trim();
  const { status, body } = await api(`/admin/packages/${code}/versions`, {
    method: "POST",
    body: JSON.stringify({
      requirements,
      customerTextIt: String(formData.get("customerTextIt") ?? ""),
      customerTextSq: sq || null,
      validFrom: romeInstant(day, "00:00").toISOString(),
      reason: String(formData.get("reason") ?? ""),
    }),
  });
  outcome(status, 201, body, "package");
}

/** An excluded case: a change (a new version) or a new case. */
export async function saveExclusion(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  const create = formData.get("create") === "1";
  if (!CODE.test(code)) redirect("/pacchetti?errore=INVALID_CODE");
  const fields = {
    blockingInWizard: formData.get("blockingInWizard") === "on",
    messageIt: String(formData.get("messageIt") ?? ""),
    messageSq: String(formData.get("messageSq") ?? ""),
    active: formData.get("active") === "on",
    reason: String(formData.get("reason") ?? ""),
  };
  const { status, body } = create
    ? await api("/admin/exclusion-rules", {
        method: "POST",
        body: JSON.stringify({ code, ...fields }),
      })
    : await api(`/admin/exclusion-rules/${code}`, { method: "PUT", body: JSON.stringify(fields) });
  outcome(status, create ? 201 : 200, body, "exclusion");
}

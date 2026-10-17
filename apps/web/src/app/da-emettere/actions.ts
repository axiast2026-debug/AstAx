"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

/** EMI-02, EMI-04: the agency's actions on a policy to issue; the API checks every rule. */
const uuid = /^[0-9a-f-]{36}$/i;
const KINDS = ["ISSUED_POLICY", "POLICY_RECEIPT", "INSURANCE_CERTIFICATE"];

function requestOf(formData: FormData): string {
  const id = String(formData.get("requestId") ?? "");
  if (!uuid.test(id)) redirect("/da-emettere");
  return id;
}

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.length
    ? problem.errors.map((e) => e.issue).join(",")
    : (problem.code ?? "INTERNAL");
}

function back(id: string, query: string): never {
  revalidatePath(`/da-emettere/${id}`);
  redirect(`/da-emettere/${id}?${query}`);
}

export async function uploadIssuanceDocument(formData: FormData): Promise<void> {
  const id = requestOf(formData);
  const kind = String(formData.get("kind") ?? "");
  if (!KINDS.includes(kind)) redirect(`/da-emettere/${id}`);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back(id, "errore=PDF_REQUIRED");
  const { status, body } = await api(`/agency/issuance/${id}/documents/${kind}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: new Uint8Array(await file.arrayBuffer()),
  });
  if (status !== 201) back(id, `errore=${encodeURIComponent(codesOf(body))}`);
  back(id, `caricato=${kind}`);
}

export async function markIssued(formData: FormData): Promise<void> {
  const id = requestOf(formData);
  const { status, body } = await api(`/agency/issuance/${id}/issue`, {
    method: "POST",
    body: JSON.stringify({ policyNumber: String(formData.get("policyNumber") ?? "") }),
  });
  if (status !== 200) back(id, `errore=${encodeURIComponent(codesOf(body))}`);
  back(id, "fatto=emessa");
}

export async function reportIssuanceProblem(formData: FormData): Promise<void> {
  const id = requestOf(formData);
  const type = formData.get("type") === "DATA_MISMATCH" ? "DATA_MISMATCH" : "CANNOT_ISSUE";
  const { status, body } = await api(`/agency/issuance/${id}/problem`, {
    method: "POST",
    body: JSON.stringify({ type, description: String(formData.get("description") ?? "") }),
  });
  if (status !== 201) back(id, `errore=${encodeURIComponent(codesOf(body))}`);
  back(id, "fatto=segnalato");
}

"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

export interface BulkOutcome {
  rows: number;
  results: { line: number; customer: "CREATED" | "EXISTING"; code: string; documents: number }[];
}

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { path: string; issue: string }[] };
  return problem.errors?.length
    ? problem.errors.map((e) => `${e.path}=${e.issue}`).join(",")
    : (problem.code ?? "INTERNAL");
}

/** The CSV, or a ZIP with the CSV and the documents (phase 7). */
export async function bulkUpload(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    redirect("/clienti/caricamento?errore=FILE_REQUIRED");
  const { status, body } = await api<BulkOutcome>("/broker/bulk-uploads", {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: new Uint8Array(await file.arrayBuffer()),
  });
  if (status !== 201) {
    redirect(`/clienti/caricamento?errore=${encodeURIComponent(codesOf(body).slice(0, 1500))}`);
  }
  const done = body.results
    .map((r) => `${r.line}:${r.code}:${r.customer}:${r.documents}`)
    .join(",");
  redirect(`/clienti/caricamento?fatto=${encodeURIComponent(done.slice(0, 1500))}`);
}

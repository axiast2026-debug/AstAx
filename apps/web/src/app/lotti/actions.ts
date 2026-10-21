"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { path: string; issue: string }[] };
  return problem.errors?.length
    ? problem.errors.map((e) => `${e.path}=${e.issue}`).join(",")
    : (problem.code ?? "INTERNAL");
}

/** ADR 0014: the broker's lot, an Excel file in AstAx's format. */
export async function uploadBatch(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/lotti?errore=FILE_REQUIRED");
  const { status, body } = await api<{ id: string; rows: number }>("/broker/batches", {
    method: "POST",
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "x-file-name": encodeURIComponent(file.name.slice(0, 200)),
    },
    body: new Uint8Array(await file.arrayBuffer()),
  });
  if (status !== 201) {
    redirect(`/lotti?errore=${encodeURIComponent(codesOf(body).slice(0, 1500))}`);
  }
  redirect(`/lotti/${body.id}?caricate=${body.rows}`);
}

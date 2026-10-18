"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const LIST = /^[a-zA-Z]+$/;
const CODE = /^[A-Z][A-Z0-9_]*$/;
const ID = /^[0-9a-f-]{36}$/;
const YEAR = /^\d{4}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.map((e) => e.issue).join(",") || problem.code || "INTERNAL";
}

function back(formData: FormData, status: number, expected: number, body: unknown, done: string) {
  revalidatePath("/elenchi-festivita");
  const params = new URLSearchParams();
  const list = String(formData.get("list") ?? "");
  const year = String(formData.get("year") ?? "");
  if (LIST.test(list)) params.set("elenco", list);
  if (YEAR.test(year)) params.set("anno", year);
  if (status !== expected) params.set("errore", codesOf(body));
  else params.set("fatto", done);
  redirect(`/elenchi-festivita?${params.toString()}`);
}

/** A value of a list: labels in Italian and Albanian, order, active. */
export async function saveListValue(formData: FormData): Promise<void> {
  const list = String(formData.get("list") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const create = formData.get("create") === "1";
  if (!LIST.test(list) || !CODE.test(code)) redirect("/elenchi-festivita?errore=INVALID_CODE");
  const fields = {
    labelIt: String(formData.get("labelIt") ?? ""),
    labelSq: String(formData.get("labelSq") ?? ""),
    active: formData.get("active") === "on",
    sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
    reason: String(formData.get("reason") ?? ""),
  };
  const { status, body } = create
    ? await api(`/admin/lists/${list}`, {
        method: "POST",
        body: JSON.stringify({ code, ...fields }),
      })
    : await api(`/admin/lists/${list}/${code}`, { method: "PUT", body: JSON.stringify(fields) });
  back(formData, status, create ? 201 : 200, body, "list");
}

export async function addHoliday(formData: FormData): Promise<void> {
  const sq = String(formData.get("nameSq") ?? "").trim();
  const { status, body } = await api("/admin/holidays", {
    method: "POST",
    body: JSON.stringify({
      date: String(formData.get("date") ?? ""),
      name: String(formData.get("name") ?? ""),
      nameSq: sq || null,
      reason: String(formData.get("reason") ?? ""),
    }),
  });
  back(formData, status, 201, body, "holiday");
}

export async function removeHoliday(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!ID.test(id)) redirect("/elenchi-festivita");
  const { status, body } = await api(`/admin/holidays/${id}/remove`, {
    method: "POST",
    body: JSON.stringify({ reason: String(formData.get("reason") ?? "") }),
  });
  back(formData, status, 200, body, "removed");
}

/** The proposal of the year (fixed dates and Easter Monday), confirmed. */
export async function confirmYear(formData: FormData): Promise<void> {
  const year = String(formData.get("year") ?? "");
  if (!YEAR.test(year)) redirect("/elenchi-festivita");
  const { status, body } = await api("/admin/holidays/confirm-year", {
    method: "POST",
    body: JSON.stringify({ year: Number(year), reason: String(formData.get("reason") ?? "") }),
  });
  back(formData, status, 200, body, "confirmed");
}

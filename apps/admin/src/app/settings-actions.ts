"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

const PAGES = ["/regole-asta", "/economia", "/sicurezza-dati"];

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
}

/** «505,00» to cents; null when not an amount (rule 5: integers only). */
function euroToCents(value: string): number | null {
  const clean = value.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, decimals = ""] = clean.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

/** The value as typed in the form, by the kind of field the panel showed. */
function valueOf(kind: string, raw: string): { ok: true; value: unknown } | { ok: false } {
  switch (kind) {
    case "money": {
      const cents = euroToCents(raw);
      return cents === null ? { ok: false } : { ok: true, value: cents };
    }
    case "number": {
      const n = Number(raw.trim().replace(",", "."));
      return raw.trim() === "" || Number.isNaN(n) ? { ok: false } : { ok: true, value: n };
    }
    case "boolean":
      return { ok: true, value: raw === "true" };
    case "text":
      return { ok: true, value: raw.trim() };
    default:
      try {
        return { ok: true, value: JSON.parse(raw) as unknown };
      } catch {
        return { ok: false };
      }
  }
}

/**
 * Spec 07: a parameter changes with a reason; the API checks the value
 * against the catalogue and the rules tying parameters together, and keeps
 * the previous version (ASTA-09: open auctions keep theirs).
 */
export async function changeSetting(formData: FormData): Promise<void> {
  const back = String(formData.get("back") ?? "");
  const page = PAGES.includes(back) ? back : "/regole-asta";
  const key = String(formData.get("key") ?? "");
  if (!/^[A-Za-z0-9.]+$/.test(key)) redirect(page);
  const parsed = valueOf(String(formData.get("kind") ?? ""), String(formData.get("value") ?? ""));
  const anchor = `#${key.replaceAll(".", "-")}`;
  if (!parsed.ok) redirect(`${page}?errore=INVALID_VALUE&chiave=${key}${anchor}`);
  const { status, body } = await api(`/admin/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value: parsed.value, reason: String(formData.get("reason") ?? "") }),
  });
  revalidatePath(page);
  if (status !== 200) {
    redirect(`${page}?errore=${encodeURIComponent(codesOf(body))}&chiave=${key}${anchor}`);
  }
  redirect(`${page}?fatto=${key}${anchor}`);
}

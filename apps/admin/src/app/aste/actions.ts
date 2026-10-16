"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

/** Back office actions on an open auction (ASTA-06); errors come back as codes. */
function auctionOf(formData: FormData): string {
  const id = String(formData.get("auctionId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/aste");
  return id;
}

const reasonOf = (formData: FormData) => String(formData.get("reason") ?? "").trim();

async function post(path: string, payload: unknown): Promise<void> {
  const { status, body } = await api(path, { method: "POST", body: JSON.stringify(payload) });
  if (status !== 202) {
    const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
    const code = problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL";
    redirect(`/aste?errore=${encodeURIComponent(code)}`);
  }
  redirect("/aste?fatto=1");
}

export async function extendAuction(formData: FormData): Promise<void> {
  await post(`/auctions/${auctionOf(formData)}/extend`, {
    workingHours: Number(formData.get("workingHours") ?? 1),
    reason: reasonOf(formData),
  });
}

export async function inviteAgencies(formData: FormData): Promise<void> {
  await post(`/auctions/${auctionOf(formData)}/invite`, {
    organizationIds: [String(formData.get("organizationId") ?? "")],
    reason: reasonOf(formData),
  });
}

export async function cancelAuction(formData: FormData): Promise<void> {
  await post(`/auctions/${auctionOf(formData)}/cancel`, { reason: reasonOf(formData) });
}

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

/** OFF-09: exclude the offer whose PDF differs, or keep it; always with a reason. */
export async function decideQuoteCheck(formData: FormData): Promise<void> {
  const id = String(formData.get("checkId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/aste");
  const decision = formData.get("decision") === "KEPT" ? "KEPT" : "EXCLUDED";
  const { status, body } = await api(`/back-office/quote-checks/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, reason: reasonOf(formData) }),
  });
  if (status !== 200) {
    const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
    redirect(
      `/aste?errore=${encodeURIComponent(problem.errors?.[0]?.issue ?? problem.code ?? "INTERNAL")}`,
    );
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

// ---------------------------------------------------------------- development tools (rule 13)

async function devPost(path: string, payload: unknown): Promise<void> {
  const { status, body } = await api(path, { method: "POST", body: JSON.stringify(payload) });
  if (status !== 200) {
    const problem = (body ?? {}) as { code?: string };
    redirect(`/aste?errore=${encodeURIComponent(problem.code ?? "INTERNAL")}`);
  }
  redirect("/aste?fatto=1");
}

export async function sendTestOffers(formData: FormData): Promise<void> {
  await devPost(`/dev/auctions/${auctionOf(formData)}/test-offers`, {
    count: Number(formData.get("count") ?? 3),
  });
}

export async function fireNextTimer(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) redirect("/aste");
  await devPost(`/dev/requests/${requestId}/fire-next-timer`, {});
}

export async function resetClock(): Promise<void> {
  await devPost("/dev/clock", { reset: true });
}

export async function advanceClock(formData: FormData): Promise<void> {
  await devPost("/dev/clock", { advanceMinutes: Number(formData.get("minutes") ?? 60) });
}

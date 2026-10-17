"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { linkProof, PROOF_HEADER, saveLinkProof, TOKEN } from "@/lib/customer-link";
import { publicApi } from "@/lib/public-api";

/** The broker's customer on the link (decision 26): code, choice, signature, payment. */
function tokenOf(formData: FormData): string {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) redirect("/");
  return token;
}

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.length
    ? problem.errors.map((e) => e.issue).join(",")
    : (problem.code ?? "INTERNAL");
}

async function withProof(token: string, init: RequestInit = {}): Promise<RequestInit> {
  const headers = new Headers(init.headers);
  const proof = await linkProof(token);
  if (proof) headers.set(PROOF_HEADER, proof);
  return { ...init, headers };
}

export async function sendOfferCode(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const { status } = await publicApi(`/customer-links/${token}/code`, {
    method: "POST",
    body: "{}",
  });
  const outcome =
    status === 204
      ? "codice=inviato"
      : status === 429
        ? "codice=inviato&errore=RATE_LIMITED"
        : "errore=LINK_INVALID";
  redirect(`/offerta/${token}?${outcome}`);
}

export async function confirmOfferCode(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const { status, body } = await publicApi<{ proof: string }>(`/customer-links/${token}/confirm`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (status !== 200) redirect(`/offerta/${token}?codice=inviato&errore=OTP_INVALID`);
  const expiresAt = new Date(String(formData.get("expiresAt") ?? ""));
  // Without a valid end, a cookie that lasts as long as the browser session.
  await saveLinkProof(token, body.proof, Number.isNaN(expiresAt.getTime()) ? undefined : expiresAt);
  redirect(`/offerta/${token}`);
}

export async function chooseLinkOffer(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const offerId = String(formData.get("offerId") ?? "");
  const { status, body } = await publicApi(
    `/customer-links/${token}/acceptance`,
    await withProof(token, { method: "POST", body: JSON.stringify({ offerId }) }),
  );
  revalidatePath(`/offerta/${token}`);
  redirect(
    status === 200
      ? `/offerta/${token}?scelta=1#accettazione`
      : `/offerta/${token}?errore=${encodeURIComponent(codesOf(body))}`,
  );
}

export async function signLinkDocuments(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  if (formData.get("read") !== "on") redirect(`/offerta/${token}?errore=DOCUMENTS_NOT_READ`);
  const { body } = await publicApi<{ acceptance?: { signingUrl: string | null } | null }>(
    `/customer-links/${token}`,
    await withProof(token),
  );
  const url = body.acceptance?.signingUrl;
  if (!url) redirect(`/offerta/${token}`);
  redirect(url);
}

export async function payLinkAcceptance(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const { status, body } = await publicApi<{ redirectUrl: string }>(
    `/customer-links/${token}/acceptance/payment`,
    await withProof(token, { method: "POST", body: "{}" }),
  );
  if (status !== 200) redirect(`/offerta/${token}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(body.redirectUrl);
}

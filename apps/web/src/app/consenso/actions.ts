"use server";

import { redirect } from "next/navigation";
import { publicApi } from "@/lib/public-api";

function tokenOf(value: FormDataEntryValue | null): string {
  const token = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) redirect("/");
  return token;
}

/** The customer asks for the code: it goes to their own email and phone. */
export async function sendLinkCode(formData: FormData): Promise<void> {
  const token = tokenOf(formData.get("token"));
  const { status } = await publicApi(`/consent-links/${token}/code`, {
    method: "POST",
    body: "{}",
  });
  redirect(`/consenso/${token}?${status === 204 ? "codice=inviato" : "errore=LINK_INVALID"}`);
}

export async function confirmLink(formData: FormData): Promise<void> {
  const token = tokenOf(formData.get("token"));
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const { status } = await publicApi(`/consent-links/${token}/confirm`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  redirect(
    `/consenso/${token}?${status === 200 ? "fatto=1" : "codice=inviato&errore=OTP_INVALID"}`,
  );
}

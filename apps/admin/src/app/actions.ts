"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LOCALE_COOKIE } from "@/i18n/request";
import { api, SESSION_COOKIE, sessionId, webAuth } from "@/lib/auth";

export async function setLocale(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "sq" ? "sq" : "it";
  (await cookies()).set(LOCALE_COOKIE, locale, { httpOnly: true, sameSite: "lax", path: "/" });
  // Also saved on the profile, so notifications use the same language.
  await api("/me", { method: "PATCH", body: JSON.stringify({ locale }) });
  redirect(await currentPage());
}

/** The page the user was on (same origin only), to stay there after the change. */
async function currentPage(): Promise<string> {
  const referer = (await headers()).get("referer");
  const adminUrl = process.env.ADMIN_URL ?? "http://localhost:3001";
  if (!referer) return "/";
  try {
    const url = new URL(referer);
    return url.origin === new URL(adminUrl).origin ? `${url.pathname}${url.search}` : "/";
  } catch {
    return "/";
  }
}

export async function acceptLegal(formData: FormData): Promise<void> {
  const versionIds = formData.getAll("versionId").map(String);
  await api("/legal/acceptances", { method: "POST", body: JSON.stringify({ versionIds }) });
  redirect("/");
}

export async function revokeSession(formData: FormData): Promise<void> {
  const sessionToRevoke = String(formData.get("sessionId") ?? "");
  await api(`/me/sessions/${encodeURIComponent(sessionToRevoke)}`, { method: "DELETE" });
  redirect("/profilo");
}

export async function logoutEverywhere(): Promise<void> {
  await api("/me/sessions/logout-all", { method: "POST" });
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function logout(): Promise<void> {
  const target = await webAuth().logout(await sessionId());
  (await cookies()).delete(SESSION_COOKIE);
  redirect(target);
}

/**
 * A ticket for the realtime connection of this browser (ADR 0008): valid 30
 * seconds, usable once; the API token stays on the server.
 */
export async function realtimeTicket(): Promise<{ ticket: string; url: string } | null> {
  const { status, body } = await api<{ ticket: string }>("/realtime/ticket", {
    method: "POST",
    body: "{}",
  });
  if (status !== 201) return null;
  return { ticket: body.ticket, url: process.env.API_PUBLIC_URL ?? process.env.API_URL ?? "" };
}

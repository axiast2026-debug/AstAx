"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOCALE_COOKIE } from "@/i18n/request";
import { api, SESSION_COOKIE, sessionId, webAuth } from "@/lib/auth";

export async function setLocale(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "sq" ? "sq" : "it";
  (await cookies()).set(LOCALE_COOKIE, locale, { httpOnly: true, sameSite: "lax", path: "/" });
  // Also saved on the profile, so notifications use the same language.
  await api("/me", { method: "PATCH", body: JSON.stringify({ locale }) });
  redirect(
    String(formData.get("returnTo") ?? "/").startsWith("/")
      ? String(formData.get("returnTo") ?? "/")
      : "/",
  );
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

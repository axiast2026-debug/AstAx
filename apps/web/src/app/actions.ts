"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, SESSION_COOKIE, sessionId, webAuth } from "@/lib/auth";

export async function chooseContext(formData: FormData): Promise<void> {
  const id = await sessionId();
  const membershipId = String(formData.get("membershipId") ?? "");
  if (!id || !/^[0-9a-f-]{36}$/i.test(membershipId)) redirect("/");
  // The API checks the membership on every call (CONTEXT_INVALID otherwise).
  await webAuth().setContext(id, membershipId);
  redirect("/");
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

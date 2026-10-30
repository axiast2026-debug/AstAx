"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, SESSION_COOKIE, sessionId, webAuth } from "@/lib/auth";
import { problemCodes } from "@/lib/problem-codes";

export async function chooseContext(formData: FormData): Promise<void> {
  const id = await sessionId();
  const membershipId = String(formData.get("membershipId") ?? "");
  if (!id || !/^[0-9a-f-]{36}$/i.test(membershipId)) redirect("/");
  // The API checks the membership on every call (CONTEXT_INVALID otherwise).
  await webAuth().setContext(id, membershipId);
  redirect("/");
}

/**
 * Audit of 2026-10-30 (A2): an invitation to a team accepted by someone who
 * already has an account; then they work for that organization.
 */
export async function acceptTeamInvite(formData: FormData): Promise<void> {
  const id = await sessionId();
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!id || !/^[0-9a-f-]{36}$/i.test(inviteId)) redirect("/inviti");
  const { status, body } = await api<{ membershipId: string }>(`/me/invites/${inviteId}/accept`, {
    method: "POST",
    body: "{}",
  });
  if (status !== 200 && status !== 201) redirect("/inviti?errore=NOT_FOUND");
  await webAuth().setContext(id, body.membershipId);
  redirect("/");
}

export async function acceptLegal(formData: FormData): Promise<void> {
  const versionIds = formData.getAll("versionId").map(String);
  await api("/legal/acceptances", { method: "POST", body: JSON.stringify({ versionIds }) });
  redirect("/");
}

/**
 * Dan, 2026-10-28: name, surname and mobile phone of a private customer at the
 * first access. Answers the error codes, or goes home once saved.
 */
export async function saveProfile(formData: FormData): Promise<string | undefined> {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const { status, body } = await api("/me/profile", {
    method: "PUT",
    body: JSON.stringify({
      firstName: field("firstName"),
      lastName: field("lastName"),
      phone: field("phone"),
    }),
  });
  if (status !== 204) return problemCodes(body);
  redirect(String(formData.get("next") ?? "") === "/profilo" ? "/profilo" : "/");
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

/** LEG-04: revokes the consent to share data with the agencies, then goes back. */
export async function revokeConsent(formData: FormData): Promise<void> {
  const consentId = String(formData.get("consentId") ?? "");
  const back = String(formData.get("back") ?? "");
  const target = back === "/profilo" || /^\/clienti\/[0-9a-f-]{36}$/i.test(back) ? back : "/";
  if (/^[0-9a-f-]{36}$/i.test(consentId)) {
    await api(`/consents/${consentId}/revoke`, { method: "POST", body: "{}" });
  }
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

/** Spec 01 «Notifiche»: a channel of an event on or off (the API refuses the locked ones). */
export async function setNotificationPreference(formData: FormData): Promise<void> {
  const eventKey = String(formData.get("eventKey") ?? "");
  const channel = String(formData.get("channel") ?? "");
  if (!/^[a-z_.]+$/.test(eventKey) || !["EMAIL", "SMS", "PUSH"].includes(channel)) {
    redirect("/profilo");
  }
  await api("/me/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify({ eventKey, channel, enabled: formData.get("enabled") === "true" }),
  });
  redirect("/profilo#notifiche");
}

/** Phase 8 (ADR 0011): this browser's push subscription, kept by the API (encrypted). */
export async function subscribePush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<boolean> {
  const { status } = await api("/me/notifications/push-subscriptions", {
    method: "POST",
    body: JSON.stringify(subscription),
  });
  return status === 201;
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await api("/me/notifications/push-subscriptions/revoke", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
}

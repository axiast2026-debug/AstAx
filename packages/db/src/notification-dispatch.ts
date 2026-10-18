import { createHash } from "node:crypto";
import type { DbTransaction } from "./client.js";
import type { NotificationChannel } from "./generated/prisma/client.js";
import type { StoredTemplate } from "./notification-templates.js";

/** How long the same event counts as a duplicate: a technical interval of the retries (rule 7 is about business numbers). */
export const DUPLICATE_WINDOW_MS = 10 * 60_000;

export interface DispatchUser {
  userId: string;
  locale: "it" | "sq";
  /** Decrypted by the caller; null when the user has none. */
  email: string | null;
  phone: string | null;
}

export interface DispatchPlan {
  inApp: DispatchUser[];
  email: DispatchUser[];
  sms: DispatchUser[];
  /** The users to push to, with their subscriptions (still encrypted). */
  push: { user: DispatchUser; subscriptions: string[] }[];
}

/** The same identifiers make the same event: a stable key of the payload. */
export function dedupeKeyOf(payload: Readonly<Record<string, string>>): string {
  const sorted = Object.keys(payload)
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join("&");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 32);
}

/**
 * docs/notifiche.md: who gets an event on which channel.
 * - The channels of the event's template (in app is always on: the
 *   notification centre keeps everything).
 * - The user's choice per event and channel; a missing choice is «on».
 * - `mandatory`: every channel of the event, whatever the choices (codes,
 *   indispensable links); `forcePush`: the push of an event with a deadline.
 * - No duplicates: the same event with the same identifiers to the same user
 *   and channel within DUPLICATE_WINDOW_MS (a retried step, a webhook twice)
 *   sends nothing; a later legitimate repetition goes out. A system step, in
 *   the caller's transaction.
 */
export async function planDispatch(
  tx: DbTransaction,
  template: StoredTemplate,
  users: readonly DispatchUser[],
  payload: Readonly<Record<string, string>>,
  options: { now: Date; only?: readonly NotificationChannel[] },
): Promise<DispatchPlan> {
  const plan: DispatchPlan = { inApp: [], email: [], sms: [], push: [] };
  if (users.length === 0) return plan;
  const ids = [...new Set(users.map((u) => u.userId))];
  const [preferences, subscriptions] = await Promise.all([
    tx.notificationPreference.findMany({
      where: { userId: { in: ids }, eventKey: template.eventKey },
    }),
    template.channels.includes("PUSH")
      ? tx.pushSubscription.findMany({ where: { userId: { in: ids }, revokedAt: null } })
      : Promise.resolve([]),
  ]);
  const wants = (userId: string, channel: NotificationChannel) => {
    if (!template.channels.includes(channel)) return false;
    if (options.only && !options.only.includes(channel)) return false;
    if (channel === "IN_APP" || template.mandatory) return true;
    if (channel === "PUSH" && template.forcePush) return true;
    const choice = preferences.find((p) => p.userId === userId && p.channel === channel);
    return choice ? choice.enabled : true;
  };
  const dedupeKey = dedupeKeyOf(payload);
  const since = new Date(options.now.getTime() - DUPLICATE_WINDOW_MS);
  const once = async (userId: string, channel: NotificationChannel) => {
    const earlier = await tx.notificationDispatch.findFirst({
      where: {
        eventKey: template.eventKey,
        dedupeKey,
        channel,
        userId,
        createdAt: { gt: since },
      },
      select: { id: true },
    });
    if (earlier) return false;
    await tx.notificationDispatch.create({
      data: { eventKey: template.eventKey, dedupeKey, userId, channel, createdAt: options.now },
    });
    return true;
  };
  const seen = new Set<string>();
  for (const user of users) {
    if (seen.has(user.userId)) continue;
    seen.add(user.userId);
    if (wants(user.userId, "IN_APP") && (await once(user.userId, "IN_APP"))) plan.inApp.push(user);
    if (user.email && wants(user.userId, "EMAIL") && (await once(user.userId, "EMAIL"))) {
      plan.email.push(user);
    }
    if (user.phone && wants(user.userId, "SMS") && (await once(user.userId, "SMS"))) {
      plan.sms.push(user);
    }
    const mine = subscriptions.filter((s) => s.userId === user.userId);
    if (mine.length > 0 && wants(user.userId, "PUSH") && (await once(user.userId, "PUSH"))) {
      plan.push.push({ user, subscriptions: mine.map((s) => s.subscriptionEnc) });
    }
  }
  return plan;
}

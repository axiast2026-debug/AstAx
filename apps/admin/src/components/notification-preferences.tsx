import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { setNotificationPreference } from "@/app/actions";
import { api } from "@/lib/auth";

interface Preference {
  eventKey: string;
  name: string;
  channels: { channel: "EMAIL" | "SMS" | "PUSH"; locked: boolean; enabled: boolean }[];
}

/**
 * Spec 01 «Notifiche» (docs/notifiche.md): for each event the channels on or
 * off. In app is always on (the notification centre); the codes and the
 * notices with a deadline stay on.
 */
export async function NotificationPreferences() {
  const t = await getTranslations("profile.notifications");
  const { status, body } = await api<Preference[]>("/me/notifications/preferences");
  if (status !== 200) return null;
  return (
    <Card>
      <CardTitle>{t("title")}</CardTitle>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      <ul className="mt-3 divide-y divide-warm-200 text-sm">
        {body.map((p) => (
          <li key={p.eventKey} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{p.name}</span>
            <span className="flex flex-wrap gap-2">
              {p.channels.map((c) => (
                <form key={c.channel} action={setNotificationPreference}>
                  <input type="hidden" name="eventKey" value={p.eventKey} />
                  <input type="hidden" name="channel" value={c.channel} />
                  <input type="hidden" name="enabled" value={String(!c.enabled)} />
                  <button
                    type="submit"
                    disabled={c.locked}
                    aria-pressed={c.enabled}
                    title={c.locked ? t("locked") : undefined}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      c.enabled
                        ? "border-green-600 bg-green-600/10 text-green-800"
                        : "border-warm-200 text-warm-600"
                    } disabled:opacity-70`}
                  >
                    {t(`channel.${c.channel}`)}: {c.enabled ? t("on") : t("off")}
                  </button>
                </form>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-warm-600">{t("lockedHint")}</p>
    </Card>
  );
}

import { formatDateTime } from "@astax/shared/format";
import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { markNotificationRead } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

export interface Inbox {
  unread: number;
  items: {
    id: string;
    title: string;
    body: string;
    link: string | null;
    read: boolean;
    createdAt: string;
  }[];
}

/** Notification centre (spec 01): in-app notices, newest first; opening one marks it read. */
export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("notifications");
  const { body: inbox } = await api<Inbox>("/me/notifications");
  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {inbox.items.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm text-warm-600">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {inbox.items.map((n) => (
            <li key={n.id}>
              <Card className={n.read ? "" : "border-orange-500"}>
                <CardTitle className="text-base">{n.title}</CardTitle>
                <p className="mt-1 text-sm">{n.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-warm-600">
                  <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                  <form action={markNotificationRead}>
                    <input type="hidden" name="notificationId" value={n.id} />
                    <input type="hidden" name="link" value={n.link ?? "/notifiche"} />
                    <button type="submit" className="font-medium text-night-900 underline">
                      {n.link ? t("open") : t("markRead")}
                    </button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

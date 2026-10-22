import { formatDateTime } from "@astax/shared/format";
import { Button, cn, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { markAllNotificationsRead, markNotificationRead } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { notificationIcon } from "@/lib/notification-icon";

export interface Inbox {
  unread: number;
  items: {
    id: string;
    eventKey: string;
    title: string;
    body: string;
    link: string | null;
    read: boolean;
    createdAt: string;
  }[];
}

/**
 * Notification centre (spec 01; centro notifiche of the design): in-app
 * notices, newest first, an icon by event and a night-blue dot on the unread
 * ones; opening one marks it read and goes to its action.
 */
export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("notifications");
  const { body: inbox } = await api<Inbox>("/me/notifications");
  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-screen font-extrabold">{t("title")}</h1>
        {inbox.unread > 0 ? (
          <form action={markAllNotificationsRead}>
            <Button type="submit" size="sm" variant="outline">
              {t("readAll")}
            </Button>
          </form>
        ) : null}
      </div>
      {inbox.items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-white px-4 py-10 text-center shadow-[inset_0_0_0_1px_var(--color-warm-200)]">
          <span className="text-warm-600">
            <Icon name="envelope" size={28} />
          </span>
          <p className="text-table text-warm-600">{t("empty")}</p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {inbox.items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "flex gap-3 rounded-2xl p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)]",
                n.read ? "bg-warm-50" : "bg-white",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                  n.read ? "bg-warm-100 text-warm-800" : "bg-night-900 text-white",
                )}
              >
                <Icon name={notificationIcon(n.eventKey)} size={20} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={cn("text-table", n.read ? "font-medium" : "font-bold")}>
                    {n.read ? null : (
                      <span
                        aria-label={t("unread")}
                        role="img"
                        className="mr-2 inline-block size-2 rounded-full bg-night-900 align-middle"
                      />
                    )}
                    {n.title}
                  </h2>
                  <time dateTime={n.createdAt} className="shrink-0 text-note text-warm-600 tabular">
                    {formatDateTime(n.createdAt)}
                  </time>
                </div>
                <p className="text-table text-warm-800">{n.body}</p>
                <form action={markNotificationRead}>
                  <input type="hidden" name="notificationId" value={n.id} />
                  <input type="hidden" name="link" value={n.link ?? "/notifiche"} />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center gap-1 text-label font-semibold text-night-900 underline"
                  >
                    {n.link ? t("open") : t("markRead")}
                    {n.link ? <Icon name="arrowRight" size={16} /> : null}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

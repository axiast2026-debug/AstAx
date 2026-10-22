import { Badge, menuFor } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { api } from "@/lib/auth";
import type { Viewer } from "@/lib/me";

/** Top bar and menu of the back office (spec 01, «Barra superiore»; specs 06-07). */
export async function AppShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const t = await getTranslations();
  const menu = menuFor(viewer.actor);
  const active = viewer.activeMembership;
  const { body: inbox } = await api<{ unread: number }>("/me/notifications");
  const unread = inbox?.unread ?? 0;

  return (
    <div className="min-h-screen">
      <header className="bg-night-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            {t("app.name")}
          </Link>
          {active ? <Badge tone="dark">{t(`roles.${active.role}`)}</Badge> : null}
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/notifiche" className="flex items-center gap-1 hover:text-orange-500">
              {t("shell.notifications")}
              <Badge
                className="tabular bg-orange-500 text-night-950"
                aria-label={t("shell.unread", { count: unread })}
              >
                {unread}
              </Badge>
            </Link>
            <Link href="/profilo" className="hover:text-orange-500">
              {t("shell.profile")}
            </Link>
            <form action={logout}>
              <button type="submit" className="hover:text-orange-500">
                {t("shell.logout")}
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <nav aria-label={t("shell.menu")} className="w-60 shrink-0">
          <ul className="space-y-1">
            {menu.map((entry) => (
              <li key={entry.key}>
                <Link
                  href={entry.href}
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-warm-100"
                >
                  {t(`menu.${entry.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

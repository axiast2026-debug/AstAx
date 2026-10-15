import { Badge, menuFor } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import type { Viewer } from "@/lib/me";

/** Top bar and menu of the active context (spec 01, «Barra superiore»). */
export async function AppShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const t = await getTranslations();
  const menu = menuFor(viewer.actor);
  const active = viewer.activeMembership;

  return (
    <div className="min-h-screen">
      <header className="bg-night-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            {t("app.name")}
          </Link>
          {active ? (
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <span className="text-warm-200">{t("shell.context")}</span>
              <span className="font-medium">{active.organization.name}</span>
              <Badge tone="dark">{t(`roles.${active.role}`)}</Badge>
              {viewer.me.memberships.length > 1 ? (
                <Link
                  href="/contesto"
                  className="text-orange-500 underline-offset-2 hover:underline"
                >
                  {t("shell.switchContext")}
                </Link>
              ) : null}
            </div>
          ) : null}
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/notifiche" className="flex items-center gap-1 hover:text-orange-500">
              {t("shell.notifications")}
              <Badge className="tabular bg-orange-500 text-night-950">{0}</Badge>
            </Link>
            <Link href="/assistenza" className="hover:text-orange-500">
              {t("shell.support")}
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
        <nav aria-label={t("shell.menu")} className="w-56 shrink-0">
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

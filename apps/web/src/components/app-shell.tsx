import { Badge, menuFor } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { chooseContext, logout } from "@/app/actions";
import { api } from "@/lib/auth";
import type { Viewer } from "@/lib/me";

/**
 * Top bar and menu of the active context (spec 01, «Barra superiore»). On a
 * phone the private customer has the menu as a bar at the bottom (spec 03,
 * «Menu (barra in basso)»); professionals get it above the page.
 */
export async function AppShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const t = await getTranslations();
  const menu = menuFor(viewer.actor);
  const active = viewer.activeMembership;
  const isPrivate = viewer.me.kind === "PRIVATE";
  const { body: inbox } = await api<{ unread: number }>("/me/notifications");
  const unread = inbox?.unread ?? 0;

  return (
    <div className={isPrivate ? "min-h-screen pb-20 md:pb-0" : "min-h-screen"}>
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        {t("shell.skip")}
      </a>
      <header className="bg-night-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            {t("app.name")}
          </Link>
          {active ? (
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <span className="text-warm-200">{t("shell.context")}</span>
              <span className="font-medium">{active.organization.name}</span>
              <Badge tone="dark">{t(`roles.${active.role}`)}</Badge>
            </div>
          ) : null}
          {active && viewer.me.memberships.length > 1 ? (
            // Spec 05 «Più agenzie»: one user, one context per organization, switched here.
            <form action={chooseContext} className="flex items-center gap-2 text-sm">
              <label htmlFor="context-switch" className="sr-only sm:not-sr-only sm:text-warm-200">
                {t("shell.switchTo")}
              </label>
              <select
                id="context-switch"
                name="membershipId"
                defaultValue={active.id}
                className="rounded-md bg-night-800 px-2 py-1 text-white"
              >
                {viewer.me.memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.organization.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md border border-orange-500 px-2 py-1 text-orange-500 hover:bg-orange-500 hover:text-night-950"
              >
                {t("shell.switchAction")}
              </button>
            </form>
          ) : null}
          <nav aria-label={t("shell.account")} className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/notifiche" className="flex items-center gap-1 hover:text-orange-500">
              {t("shell.notifications")}
              <Badge
                className="tabular bg-orange-500 text-night-950"
                aria-label={t("shell.unread", { count: unread })}
              >
                {unread}
              </Badge>
            </Link>
            <Link href="/assistenza" className="hidden hover:text-orange-500 sm:inline">
              {t("shell.support")}
            </Link>
            <Link href="/profilo" className="hidden hover:text-orange-500 sm:inline">
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
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:py-8">
        <nav
          aria-label={t("shell.menu")}
          className={isPrivate ? "hidden w-56 shrink-0 md:block" : "w-full shrink-0 md:w-56"}
        >
          <ul
            className={isPrivate ? "space-y-1" : "flex gap-1 overflow-x-auto md:block md:space-y-1"}
          >
            {menu.map((entry) => (
              <li key={entry.key} className="shrink-0">
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
        <main id="contenuto" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
      {isPrivate ? (
        <nav
          aria-label={t("shell.menu")}
          className="fixed inset-x-0 bottom-0 border-t border-warm-200 bg-white md:hidden"
        >
          <ul className="grid grid-cols-5">
            {menu.map((entry) => (
              <li key={entry.key}>
                <Link
                  href={entry.href}
                  className="block px-1 py-3 text-center text-xs font-medium text-night-900"
                >
                  {t(`menu.${entry.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

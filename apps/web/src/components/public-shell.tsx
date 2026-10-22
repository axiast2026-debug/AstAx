import { buttonVariants, cn, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

/** «AstA» with the orange «x», on night blue (design system, Logo). */
export async function Logo() {
  const t = await getTranslations("publicHome");
  return (
    <span className="font-display text-2xl font-black tracking-[-0.035em] text-white">
      {t.rich("logo", { x: (c) => <span className="text-orange-400">{c}</span> })}
    </span>
  );
}

/**
 * The bar of the public pages, on night blue: the pages and the way in. On
 * «Accedi» the ways in are the page itself, so the bar has only the pages.
 */
export async function PublicHeader({ ways = true }: { ways?: boolean } = {}) {
  const t = await getTranslations("publicHome");
  return (
    <header className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
      <Link href="/" aria-label={t("homeLabel")} className="inline-flex min-h-11 items-center">
        <Logo />
      </Link>
      <nav aria-label={t("pagesLabel")} className="ml-auto flex items-center gap-1 sm:gap-4">
        <Link
          href="/come-funziona"
          className="hidden min-h-11 items-center text-label font-semibold sm:inline-flex"
        >
          {t("howItWorks")}
        </Link>
        <Link
          href="/per-le-agenzie"
          className="hidden min-h-11 items-center text-label font-semibold md:inline-flex"
        >
          {t("forAgencies")}
        </Link>
        {ways ? (
          <>
            <a
              href="/auth/login?as=pro"
              className="hidden min-h-11 items-center text-label font-semibold lg:inline-flex"
            >
              {t("proAccess")}
            </a>
            <Link
              href="/accedi"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-white hover:bg-night-800",
              )}
            >
              <Icon name="user" size={18} />
              {t("login")}
            </Link>
          </>
        ) : null}
      </nav>
    </header>
  );
}

/** The foot of the public pages: the RUI number and the public pages. */
export async function PublicFooter() {
  const t = await getTranslations("publicHome");
  const links = [
    { href: "/come-funziona", label: t("howItWorks") },
    { href: "/per-le-agenzie", label: t("forAgencies") },
    { href: "/domande-frequenti", label: t("faq") },
    { href: "/accedi", label: t("login") },
  ];
  return (
    <footer className="border-t border-warm-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-table text-warm-600 lg:flex-row lg:items-center lg:justify-between">
        <span>{t("footerRui")}</span>
        <nav aria-label={t("footerLabel")} className="flex flex-wrap gap-x-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-11 items-center underline"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

/**
 * A public page (pagine pubbliche of the design): night-blue band with the
 * bar, the title and the intro, calm content, the foot. Open without login.
 */
export async function PublicPage({
  title,
  intro,
  ways = true,
  children,
}: {
  title: string;
  intro?: string;
  /** False on «Accedi»: see PublicHeader. */
  ways?: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations("publicHome");
  return (
    <div className="min-h-screen bg-warm-50">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        {t("skip")}
      </a>
      <div className="on-dark bg-night-900 text-white">
        <PublicHeader ways={ways} />
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-6 pb-10 lg:pt-10 lg:pb-14">
          <h1 className="font-display text-price font-extrabold">{title}</h1>
          {intro ? <p className="max-w-2xl text-body text-night-300">{intro}</p> : null}
        </div>
      </div>
      <main id="contenuto" className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

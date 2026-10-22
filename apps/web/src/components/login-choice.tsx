import { buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

/** The two ways in: the private customer with a code, the professionals with password and TOTP. */
export async function LoginChoice({ expired }: { expired: boolean }) {
  const t = await getTranslations("login");
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold text-night-900">{t("title")}</h1>
      {expired ? (
        <p className="rounded-lg bg-orange-500/15 px-4 py-3 text-sm">{t("expired")}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>{t("privateTitle")}</CardTitle>
          <p className="mt-2 text-sm text-warm-600">{t("privateText")}</p>
          <a href="/auth/login?as=private" className={buttonVariants({ className: "mt-4 w-full" })}>
            {t("privateButton")}
          </a>
        </Card>
        <Card>
          <CardTitle>{t("proTitle")}</CardTitle>
          <p className="mt-2 text-sm text-warm-600">{t("proText")}</p>
          <a
            href="/auth/login?as=pro"
            className={buttonVariants({ variant: "secondary", className: "mt-4 w-full" })}
          >
            {t("proButton")}
          </a>
          <Link href="/ingresso" className="mt-3 block text-center text-sm underline">
            {t("proJoin")}
          </Link>
        </Card>
      </div>
    </main>
  );
}

import { buttonVariants, cn, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PublicPage } from "@/components/public-shell";

/**
 * The two ways in (primo accesso of the design): the private customer with a
 * code by email, the professionals with password and TOTP.
 */
export async function LoginChoice({ expired }: { expired: boolean }) {
  const t = await getTranslations("login");
  const card =
    "flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6";
  return (
    <PublicPage title={t("title")} ways={false}>
      {expired ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-warning-50 px-4 py-3 text-table"
        >
          <span className="inline-flex pt-0.5 text-warning-700">
            <Icon name="clock" size={18} />
          </span>
          {t("expired")}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="private-title" className={card}>
          <span
            aria-hidden
            className="inline-flex size-11 items-center justify-center rounded-xl bg-orange-500 text-night-900"
          >
            <Icon name="user" size={22} />
          </span>
          <h2 id="private-title" className="text-section font-bold">
            {t("privateTitle")}
          </h2>
          <p className="text-table text-warm-800">{t("privateText")}</p>
          <a
            href="/auth/login?as=private"
            className={cn(buttonVariants({ size: "lg" }), "mt-auto w-full")}
          >
            {t("privateButton")}
          </a>
        </section>
        <section aria-labelledby="pro-title" className={card}>
          <span
            aria-hidden
            className="inline-flex size-11 items-center justify-center rounded-xl bg-night-900 text-white"
          >
            <Icon name="lock" size={22} />
          </span>
          <h2 id="pro-title" className="text-section font-bold">
            {t("proTitle")}
          </h2>
          <p className="text-table text-warm-800">{t("proText")}</p>
          <a
            href="/auth/login?as=pro"
            className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "mt-auto w-full")}
          >
            {t("proButton")}
          </a>
          <Link
            href="/ingresso"
            className="inline-flex min-h-11 items-center justify-center text-table underline"
          >
            {t("proJoin")}
          </Link>
        </section>
      </div>
    </PublicPage>
  );
}

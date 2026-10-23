import { Button } from "@astax/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PublicPage } from "@/components/public-shell";
import { sessionId, webAuth } from "@/lib/auth";
import { isMagicLinkToken } from "@/lib/magic-link";

/** The token is in this page's address: it must not travel on as a referrer. */
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

/**
 * Landing page of the magic link in the email code (ADR 0019, proposal B1 of
 * the UX review). The token is posted to /auth/link, by the script as soon as
 * the page loads, or by the button for who has no script: a tap on the link in
 * the email is all it takes. Nothing but the token is in the URL (rule 8).
 */
export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const token = (await searchParams).t;
  if (!isMagicLinkToken(token)) redirect("/accedi");
  if (await webAuth().session(await sessionId())) redirect("/");
  const t = await getTranslations("login");
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <PublicPage title={t("linkTitle")} ways={false}>
      <form
        id="magic-link"
        action="/auth/link"
        method="post"
        className="flex max-w-md flex-col gap-4 rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:p-6"
      >
        <p className="text-body text-warm-800">{t("linkText")}</p>
        <input type="hidden" name="t" value={token} />
        <Button type="submit" size="lg">
          {t("linkButton")}
        </Button>
        <p className="text-note text-warm-600">{t("linkNote")}</p>
      </form>
      <script
        nonce={nonce}
        // Submits once the page is there; the button stays for who has no script.
        dangerouslySetInnerHTML={{
          __html: "document.getElementById('magic-link').requestSubmit();",
        }}
      />
    </PublicPage>
  );
}

import { buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { sessionId, webAuth } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ scaduta?: string }>;
}) {
  const session = await webAuth().session(await sessionId());
  if (!session) return <Login expired={(await searchParams).scaduta === "1"} />;

  const viewer = await requireViewer();
  const t = await getTranslations("home");
  return (
    <AppShell viewer={viewer}>
      <Card>
        <CardTitle>{t("welcome", { name: viewer.me.firstName })}</CardTitle>
        <p className="mt-2 text-warm-600">{t("intro")}</p>
      </Card>
    </AppShell>
  );
}

async function Login({ expired }: { expired: boolean }) {
  const t = await getTranslations("login");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <Card>
        <CardTitle>{t("title")}</CardTitle>
        {expired ? (
          <p className="mt-3 rounded-lg bg-orange-500/15 px-3 py-2 text-sm">{t("expired")}</p>
        ) : null}
        <p className="mt-2 text-sm text-warm-600">{t("text")}</p>
        <a
          href="/auth/login"
          className={buttonVariants({ variant: "secondary", className: "mt-4 w-full" })}
        >
          {t("button")}
        </a>
      </Card>
    </main>
  );
}

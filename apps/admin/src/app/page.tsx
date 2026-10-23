import { buttonVariants, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { sessionId, webAuth } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { can } from "@astax/shared/permissions";
import { AdminDashboard } from "@/components/admin-dashboard";
import { OperationsDashboard } from "@/components/operations-dashboard";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    scaduta?: string;
    da?: string;
    a?: string;
    canale?: string;
    provincia?: string;
  }>;
}) {
  const session = await webAuth().session(await sessionId());
  const query = await searchParams;
  if (!session) return <Login expired={query.scaduta === "1"} />;

  const viewer = await requireViewer();
  const t = await getTranslations("home");
  return (
    <AppShell viewer={viewer}>
      <Card>
        <h1 className="font-display text-screen font-extrabold">
          {t("welcome", { name: viewer.me.firstName })}
        </h1>
        <p className="mt-2 text-warm-600">{t("intro")}</p>
      </Card>
      {can(viewer.actor, "admin.reports.view") ? <AdminDashboard query={query} /> : null}
      {can(viewer.actor, "backOffice.dashboard") ? <OperationsDashboard /> : null}
    </AppShell>
  );
}

async function Login({ expired }: { expired: boolean }) {
  const t = await getTranslations("login");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <Card>
        <h1 className="font-display text-screen font-extrabold">{t("title")}</h1>
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

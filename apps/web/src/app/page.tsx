import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { LoginChoice } from "@/components/login-choice";
import { PrivateHome } from "@/components/private-home";
import { PublicHome, type PublicHomeData } from "@/components/public-home";
import Link from "next/link";
import { api, sessionId, webAuth } from "@/lib/auth";
import type { AgencyDashboard } from "@/lib/agency";
import { requireViewer } from "@/lib/me";
import { publicApi } from "@/lib/public-api";
import { redirect } from "next/navigation";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ scaduta?: string }>;
}) {
  const session = await webAuth().session(await sessionId());
  if (!session) {
    if ((await searchParams).scaduta === "1") redirect("/accedi?scaduta=1");
    // Momento 1 (ADR 0016): the public home; without the API, the two ways in.
    const { status, body } = await publicApi<PublicHomeData>("/public/home").catch(() => ({
      status: 0,
      body: null,
    }));
    if (status !== 200 || !body) return <LoginChoice expired={false} />;
    return <PublicHome data={body} />;
  }

  const viewer = await requireViewer();
  const t = await getTranslations("home");
  const isPrivate = viewer.me.kind === "PRIVATE";
  if (isPrivate) {
    return (
      <AppShell viewer={viewer}>
        <PrivateHome firstName={viewer.me.firstName} />
      </AppShell>
    );
  }
  const dashboard =
    viewer.activeMembership?.organization.type === "AGENCY"
      ? (await api<AgencyDashboard>("/agency/dashboard")).body
      : null;
  return (
    <AppShell viewer={viewer}>
      {dashboard ? (
        <AgencyPanel
          dashboard={dashboard}
          personal={viewer.activeMembership?.role === "OPERATOR"}
        />
      ) : null}
      <Card>
        {/* One level-one heading per page: the agency dashboard has its own. */}
        {dashboard ? (
          <CardTitle>{t("welcome", { name: viewer.me.firstName })}</CardTitle>
        ) : (
          <h1 className="font-display text-screen font-extrabold">
            {t("welcome", { name: viewer.me.firstName })}
          </h1>
        )}
        <p className="mt-2 text-warm-600">{t("proIntro")}</p>
      </Card>
    </AppShell>
  );
}

/** The agency dashboard (spec 04): counters now, indicators of the last 30 days. */
async function AgencyPanel({
  dashboard,
  personal,
}: {
  dashboard: AgencyDashboard;
  personal: boolean;
}) {
  const t = await getTranslations("agency.dashboard");
  const show = (value: number | null, percent = false) =>
    value === null ? t("notYet") : percent ? `${Math.round(value * 100)}%` : String(value);
  return (
    <section aria-labelledby="agency-dashboard" className="mb-6">
      <h1 id="agency-dashboard" className="text-2xl font-bold">
        {personal ? t("personalTitle") : t("title")}
      </h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {Object.entries(dashboard.counters).map(([key, value]) => (
          <Card key={key}>
            <p className="text-sm text-warm-600">{t(`counters.${key}`)}</p>
            <p className="mt-1 text-2xl font-bold tabular">{show(value)}</p>
          </Card>
        ))}
      </div>
      <h2 className="mt-6 text-lg font-semibold">{t("last30Days")}</h2>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[16rem_1fr]">
        {Object.entries(dashboard.last30Days).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-warm-600">{t(`indicators.${key}`)}</dt>
            <dd className="tabular">{show(value, key.endsWith("Rate"))}</dd>
          </div>
        ))}
      </dl>
      <Link href="/richieste-in-arrivo" className="mt-4 inline-block font-medium underline">
        {t("goIncoming")}
      </Link>
    </section>
  );
}

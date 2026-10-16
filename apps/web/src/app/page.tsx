import { Button, buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { createPrivateRequest } from "@/app/request-actions";
import { StatusBadge } from "@/components/request-view";
import { api, sessionId, webAuth } from "@/lib/auth";
import type { AgencyDashboard } from "@/lib/agency";
import type { RequestSummary } from "@/lib/requests";
import { requireViewer } from "@/lib/me";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ scaduta?: string }>;
}) {
  const session = await webAuth().session(await sessionId());
  if (!session) return <LoginChoice expired={(await searchParams).scaduta === "1"} />;

  const viewer = await requireViewer();
  const t = await getTranslations("home");
  const isPrivate = viewer.me.kind === "PRIVATE";
  const current = isPrivate
    ? (await api<RequestSummary[]>("/requests")).body.find(
        (r) => !["CANCELLED", "EXCLUDED"].includes(r.status),
      )
    : undefined;
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
        <CardTitle>{t("welcome", { name: viewer.me.firstName })}</CardTitle>
        <p className="mt-2 text-warm-600">{isPrivate ? t("privateIntro") : t("proIntro")}</p>
        {isPrivate ? (
          <form action={createPrivateRequest} className="mt-4">
            <Button type="submit" size="lg">
              {t("newQuote")}
            </Button>
          </form>
        ) : null}
      </Card>
      {current ? (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{t("currentRequest", { code: current.code })}</CardTitle>
            <StatusBadge status={current.status} />
          </div>
          <p className="mt-2 text-sm text-warm-600">
            {current.status === "INTEGRATION_REQUESTED"
              ? t("actionIntegration")
              : t(`statusHint.${current.status}`)}
          </p>
          <Link
            href={`/preventivi/${current.id}`}
            className="mt-3 inline-block font-medium underline"
          >
            {t("open")}
          </Link>
        </Card>
      ) : null}
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

async function LoginChoice({ expired }: { expired: boolean }) {
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
        </Card>
      </div>
    </main>
  );
}

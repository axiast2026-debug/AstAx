import { formatDateTime } from "@astax/shared/format";
import { Button, buttonVariants, Card, CardTitle, linksFor } from "@astax/ui";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { logoutEverywhere, revokeConsent, revokeSession } from "@/app/actions";
import { AgencyProfileCard } from "@/components/agency-profile-card";
import { AppShell } from "@/components/app-shell";
import { NotificationPreferences } from "@/components/notification-preferences";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface OwnConsent {
  id: string;
  method: string;
  version: number | null;
  acceptedAt: string;
  revokedAt: string | null;
}

interface ActiveSession {
  id: string;
  ipAddress: string | null;
  startedAt: string;
  lastAccessAt: string;
}

/**
 * Profile: personal data, organizations and roles, active sessions (spec 01,
 * «Profilo»); for an agency also the agency's data (Dan, 2026-10-21).
 */
export default async function ProfilePage() {
  const viewer = await requireViewer();
  const t = await getTranslations();
  const { body: sessions } = await api<ActiveSession[]>("/me/sessions");
  const { me } = viewer;
  const consents = me.kind === "PRIVATE" ? (await api<OwnConsent[]>("/me/consents")).body : [];
  const missing = t("profile.missing");
  const links = linksFor(viewer.actor);
  const agency = viewer.activeMembership?.organization.type === "AGENCY";

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
      <div className="mt-6 space-y-6">
        {agency ? <AgencyProfileCard /> : null}
        {links.length > 0 ? (
          // Dan, 2026-10-21: the pages left out of the short menus.
          <Card>
            <CardTitle>
              {me.kind === "PRIVATE" ? t("profile.morePages") : t("profile.otherPages")}
            </CardTitle>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {links.map((l) => (
                <li key={l.key}>
                  <Link
                    href={l.href}
                    className={buttonVariants({ variant: "outline", className: "w-full" })}
                  >
                    {t(`menu.${l.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card>
          <CardTitle>{t("profile.data")}</CardTitle>
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-warm-600">{t("profile.name")}</dt>
            <dd>{`${me.firstName} ${me.lastName}`.trim() || missing}</dd>
            <dt className="text-warm-600">{t("profile.email")}</dt>
            <dd>{me.email ?? missing}</dd>
            <dt className="text-warm-600">{t("profile.phone")}</dt>
            <dd>{me.phone ?? missing}</dd>
          </dl>
        </Card>

        {me.memberships.length > 0 ? (
          <Card>
            <CardTitle>{t("profile.roles")}</CardTitle>
            <ul className="mt-4 space-y-1 text-sm">
              {me.memberships.map((m) => (
                <li key={m.id}>
                  {m.organization.name} · {t(`roles.${m.role}`)}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {me.kind === "PRIVATE" ? (
          <Card>
            <CardTitle>{t("profile.consents")}</CardTitle>
            <p className="mt-1 text-sm text-warm-600">{t("profile.consentsIntro")}</p>
            {consents.length === 0 ? (
              <p className="mt-4 text-sm">{t("profile.noConsents")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-warm-200">
                {consents.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div>
                      <div>
                        {t("profile.consentLine", {
                          at: formatDateTime(c.acceptedAt),
                          version: c.version ?? "—",
                        })}
                      </div>
                      {c.revokedAt ? (
                        <div className="text-warm-600">
                          {t("profile.consentRevokedAt", { at: formatDateTime(c.revokedAt) })}
                        </div>
                      ) : null}
                    </div>
                    {c.revokedAt ? null : (
                      <form action={revokeConsent}>
                        <input type="hidden" name="consentId" value={c.id} />
                        <input type="hidden" name="back" value="/profilo" />
                        <Button type="submit" variant="outline" size="sm">
                          {t("profile.revokeConsent")}
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <Card>
          <CardTitle>{t("profile.sessions")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">{t("profile.sessionsIntro")}</p>
          {sessions.length === 0 ? (
            <p className="mt-4 text-sm">{t("profile.noSessions")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-warm-200">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div className="tabular">
                    <div>
                      {t("profile.sessionStarted")}: {formatDateTime(s.startedAt)}
                    </div>
                    <div className="text-warm-600">
                      {t("profile.sessionLastAccess")}: {formatDateTime(s.lastAccessAt)} ·{" "}
                      {t("profile.sessionIp")}: {s.ipAddress ?? missing}
                    </div>
                  </div>
                  <form action={revokeSession}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <Button type="submit" variant="outline" size="sm">
                      {t("profile.revoke")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={logoutEverywhere} className="mt-4">
            <Button type="submit" variant="danger">
              {t("profile.logoutAll")}
            </Button>
          </form>
        </Card>
        <section id="notifiche">
          <NotificationPreferences />
        </section>
      </div>
    </AppShell>
  );
}

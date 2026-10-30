import { formatDate, formatDateTime } from "@astax/shared/format";
import { can, type MembershipFlags, type MembershipRole } from "@astax/shared/permissions";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  inviteMember,
  removeMember,
  revokeInvite,
  setMemberStatus,
  updateMember,
} from "@/app/agency-settings-actions";
import { AppShell } from "@/components/app-shell";
import { CheckField, ErrorSummary, Field } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

type Flag = keyof MembershipFlags;

/** Each flag belongs to one role of one kind of organization (docs/permessi.md, «Abilitazioni»). */
const FLAGS: Record<"AGENCY" | "BROKER", Partial<Record<MembershipRole, Flag[]>>> = {
  AGENCY: {
    OPERATOR: ["canIssue", "canSeeColleagueOffers", "seesAllClients"],
    SUPERVISOR: ["canSeeAccounting"],
  },
  BROKER: { OPERATOR: ["seesAllClients"] },
};
const ROLES: Record<"AGENCY" | "BROKER", MembershipRole[]> = {
  AGENCY: ["SUPERVISOR", "OPERATOR"],
  BROKER: ["OPERATOR"],
};

interface Team {
  members: {
    membershipId: string;
    userId: string;
    firstName: string;
    lastName: string;
    role: MembershipRole;
    status: "ACTIVE" | "SUSPENDED";
    flags: MembershipFlags;
    ruiNumberE: string | null;
    ruiVerified: boolean;
    lastLoginAt: string | null;
  }[];
  pendingInvites: { id: string; role: MembershipRole; expiresAt: string }[];
}

/**
 * «Team» (spec 02 and 04): the users of the organization with role, RUI
 * number, permissions, state and last access; invite, change, suspend,
 * remove. The agency owner also reaches the access log (VIS-08).
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const type = viewer.activeMembership?.organization.type;
  if ((type !== "AGENCY" && type !== "BROKER") || !can(viewer.actor, "team.manage")) notFound();
  const t = await getTranslations("team");
  const tr = await getTranslations("roles");
  const query = await searchParams;
  const { body: team } = await api<Team>("/team");
  const allFlags = [...new Set(Object.values(FLAGS[type]).flat())];

  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {can(viewer.actor, "accessLog.viewOwnAgency") ? (
          <Link href="/team/registro" className="font-medium underline">
            {t("accessLog")}
          </Link>
        ) : null}
      </div>
      <div className="mt-4">
        <ErrorSummary codes={query.errore} />
      </div>
      {query.fatto ? (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${query.fatto}`)}
        </p>
      ) : null}

      <div className="grid gap-4">
        {team.members.map((m) => {
          const editable = m.role !== "OWNER" && m.userId !== viewer.me.id;
          const flags = FLAGS[type][m.role] ?? [];
          const name = `${m.firstName} ${m.lastName}`.trim();
          return (
            <Card key={m.membershipId}>
              <section aria-label={name}>
                <div className="flex flex-wrap items-center gap-3">
                  <CardTitle>{name}</CardTitle>
                  <Badge>{tr(m.role)}</Badge>
                  <Badge tone={m.status === "ACTIVE" ? "success" : "danger"}>
                    {t(`status.${m.status}`)}
                  </Badge>
                </div>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
                  <dt className="text-warm-600">{t("lastLogin")}</dt>
                  <dd>{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : t("never")}</dd>
                  <dt className="text-warm-600">{t("permissions")}</dt>
                  <dd>
                    {flags
                      .filter((f) => m.flags[f])
                      .map((f) => t(`flags.${f}`))
                      .join(", ") || "—"}
                  </dd>
                </dl>
                {editable ? (
                  <div className="mt-4 flex flex-wrap items-end gap-4">
                    <form action={updateMember} className="flex flex-wrap items-end gap-4">
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      {ROLES[type].length > 1 ? (
                        <label className="text-sm font-medium">
                          {t("role")}
                          <select
                            name="role"
                            defaultValue={m.role}
                            className="mt-1 block rounded-lg border border-warm-200 bg-white px-3 py-2"
                          >
                            {ROLES[type].map((r) => (
                              <option key={r} value={r}>
                                {tr(r)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {flags.map((f) => (
                        <span key={f}>
                          <input type="hidden" name="shownFlags" value={f} />
                          <CheckField
                            label={t(`flags.${f}`)}
                            name={`flag.${f}`}
                            value={m.membershipId}
                            defaultChecked={m.flags[f]}
                          />
                        </span>
                      ))}
                      <Button type="submit" size="sm" variant="outline">
                        {t("save")}
                      </Button>
                    </form>
                    <form action={setMemberStatus}>
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      <input
                        type="hidden"
                        name="status"
                        value={m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        {m.status === "ACTIVE" ? t("suspend") : t("reactivate")}
                      </Button>
                    </form>
                    <form action={removeMember}>
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      <Button type="submit" size="sm" variant="outline">
                        {t("remove")}
                      </Button>
                    </form>
                  </div>
                ) : null}
              </section>
            </Card>
          );
        })}
      </div>

      {team.pendingInvites.length > 0 ? (
        <Card className="mt-6">
          <CardTitle>{t("pending")}</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {team.pendingInvites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3">
                {t("pendingRow", { role: tr(i.role), date: formatDate(i.expiresAt) })}
                <form action={revokeInvite}>
                  <input type="hidden" name="inviteId" value={i.id} />
                  <Button type="submit" size="sm" variant="outline">
                    {t("revoke")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardTitle>{t("invite")}</CardTitle>
        <form action={inviteMember} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("firstName")} name="firstName" required maxLength={100} />
          <Field label={t("lastName")} name="lastName" required maxLength={100} />
          <Field label={t("email")} name="email" type="email" required maxLength={254} />
          <div>
            <label htmlFor="f-role" className="block text-sm font-medium">
              {t("role")}
            </label>
            <select
              id="f-role"
              name="role"
              defaultValue="OPERATOR"
              className="mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2"
            >
              {ROLES[type].map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">{t("permissions")}</legend>
            <p className="text-xs text-warm-600">{t("flagsHint")}</p>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              {allFlags.map((f) => (
                <CheckField key={f} label={t(`flags.${f}`)} name={`flag.${f}`} value="invite" />
              ))}
            </div>
          </fieldset>
          <Button type="submit" className="sm:justify-self-start">
            {t("sendInvite")}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}

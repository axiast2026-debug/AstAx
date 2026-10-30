import { formatDate } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptTeamInvite } from "@/app/actions";
import { ErrorSummary } from "@/components/form";
import { api } from "@/lib/auth";
import type { Me } from "@/lib/me";

interface Invite {
  id: string;
  organization: { name: string; type: "AGENCY" | "BROKER" };
  role: "SUPERVISOR" | "OPERATOR";
  expiresAt: string;
}

/**
 * Audit of 2026-10-30 (A2): the page the team invitation email links to, for
 * someone who already has an account (a new user joins at the first access).
 * No context needed: the invitations are the user's, from any organization.
 */
export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const t = await getTranslations();
  const query = await searchParams;
  const { body: me } = await api<Me>("/me");
  if (me.kind === "PRIVATE") redirect("/");
  const { body: invites } = await api<Invite[]>("/me/invites");
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">{t("invites.title")}</h1>
      <ErrorSummary codes={query.errore} />
      {invites.length === 0 ? (
        <p className="text-body">{t("invites.none")}</p>
      ) : (
        <div className="space-y-3">
          {invites.map((i) => (
            <Card key={i.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>{i.organization.name}</CardTitle>
                <p className="text-sm text-warm-600">
                  {t(`organizationTypes.${i.organization.type}`)} · {t(`roles.${i.role}`)} ·{" "}
                  {t("invites.until", { date: formatDate(i.expiresAt) })}
                </p>
              </div>
              <form action={acceptTeamInvite}>
                <input type="hidden" name="inviteId" value={i.id} />
                <Button type="submit">{t("invites.accept")}</Button>
              </form>
            </Card>
          ))}
        </div>
      )}
      <Link href="/" className="text-label font-semibold underline underline-offset-2">
        {t("invites.home")}
      </Link>
    </main>
  );
}

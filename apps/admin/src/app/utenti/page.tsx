import { Button, Card } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { staffRole, userStep } from "./actions";

interface User {
  id: string;
  name: string;
  email: string | null;
  kind: "PRIVATE" | "PROFESSIONAL" | "STAFF";
  status: "ACTIVE" | "SUSPENDED" | "BLOCKED";
  memberships: { organization: string; type: string; role: string; status: string }[];
}

const KINDS = ["PRIVATE", "PROFESSIONAL", "STAFF"] as const;
const STAFF_ROLES = ["BO_VERIFIER", "BO_SUPPORT", "BO_ACCOUNTING", "BO_SUPERVISOR", "ADMIN"];
const DONE = ["block", "unblock", "reset-second-factor", "role"] as const;
const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * «Utenti e permessi» (spec 07): find a user, block or unblock, reset the
 * second factor, give or take a back office role. Every action asks a reason.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("users");
  const query = await searchParams;
  const kind = KINDS.find((k) => k === query.tipo);
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (kind) params.set("kind", kind);
  const { status, body } = await api<User[]>(`/admin/users?${params.toString()}`);
  if (status !== 200) notFound();

  const hidden = (
    <>
      <input type="hidden" name="q" value={query.q ?? ""} />
      <input type="hidden" name="kind" value={kind ?? ""} />
    </>
  );

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : null}
      {query.fatto ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${DONE.find((d) => d === query.fatto) ?? "reset-second-factor"}`)}
        </p>
      ) : null}

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">
          {t("search")}
          <input name="q" defaultValue={query.q ?? ""} className={field} />
        </label>
        <label className="grid gap-1">
          {t("kind")}
          <select name="tipo" defaultValue={kind ?? ""} className={field}>
            <option value="">{t("allKinds")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          {t("find")}
        </Button>
      </form>

      <p className="mt-4 text-sm text-warm-600">{t("results", { count: body.length })}</p>
      <div className="mt-2 space-y-3">
        {body.map((u) => (
          <Card key={u.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{u.name}</h2>
              <span className="text-sm">
                {t(`kinds.${u.kind}`)} · {t(`status.${u.status}`)}
              </span>
            </div>
            <p className="text-sm text-warm-600">{u.email ?? "—"}</p>
            {u.memberships.length > 0 ? (
              <ul className="mt-1 text-sm">
                {u.memberships.map((m) => (
                  <li key={`${m.organization}-${m.role}`}>
                    {m.organization} · {m.role}
                    {m.status === "ACTIVE" ? "" : ` · ${m.status}`}
                  </li>
                ))}
              </ul>
            ) : null}
            {u.id === viewer.me.id ? null : (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer underline">{t("actions")}</summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <form action={userStep} className="grid gap-2">
                    {hidden}
                    <input type="hidden" name="userId" value={u.id} />
                    <label className="grid gap-1">
                      {t("step")}
                      <select name="step" className={field}>
                        {u.status === "BLOCKED" ? (
                          <option value="unblock">{t("unblock")}</option>
                        ) : (
                          <option value="block">{t("block")}</option>
                        )}
                        {u.kind === "PRIVATE" ? null : (
                          <option value="reset-second-factor">{t("resetSecondFactor")}</option>
                        )}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      {t("reason")}
                      <input name="reason" required minLength={3} className={field} />
                    </label>
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      className="justify-self-start"
                    >
                      {t("confirm")}
                    </Button>
                  </form>
                  {u.kind === "STAFF" ? (
                    <form action={staffRole} className="grid gap-2">
                      {hidden}
                      <input type="hidden" name="userId" value={u.id} />
                      <label className="grid gap-1">
                        {t("role")}
                        <select
                          name="role"
                          defaultValue={
                            u.memberships.find((m) => m.type === "ASTAX" && m.status === "ACTIVE")
                              ?.role ?? ""
                          }
                          className={field}
                        >
                          <option value="">{t("noRole")}</option>
                          {STAFF_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`roles.${r}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        {t("reason")}
                        <input name="reason" required minLength={3} className={field} />
                      </label>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="justify-self-start"
                      >
                        {t("saveRole")}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </details>
            )}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

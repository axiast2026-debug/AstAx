import { formatDate, formatDateTime } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { closeDataRequest, openDataRequest } from "../actions";

interface CustomerCard {
  id: string;
  name: string;
  fiscalCode: string | null;
  vatNumber: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  vehicles: string[];
  requests: { id: string; code: string; status: string; plate: string | null; createdAt: string }[];
  policies: {
    id: string;
    number: string;
    status: string;
    startDate: string;
    endDate: string;
    requestCode: string;
  }[];
  consents: { type: string; method: string; acceptedAt: string; revokedAt: string | null }[];
  tickets: { id: string; code: string; subject: string; status: string }[];
  dataRequests: {
    id: string;
    kind: string;
    status: string;
    description: string;
    receivedAt: string;
    dueAt: string;
    outcome: string | null;
  }[];
  accessLog: { at: string; action: string; who: string | null; whoKind: string | null }[];
}

const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * The customer's card (spec 06): data, requests, policies, consents, the
 * requests about personal data and who opened the data. Opening it is logged.
 */
export default async function CustomerCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer();
  const t = await getTranslations("customersBo");
  const query = await searchParams;
  const { status, body: c } = await api<CustomerCard>(`/back-office/customers/${id}`);
  if (status !== 200) notFound();
  const manage = can(viewer.actor, "dataSubjectRequest.manage");

  return (
    <AppShell viewer={viewer}>
      <Link href="/clienti" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{c.name}</h1>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : query.fatto === "aperta" || query.fatto === "chiusa" ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${query.fatto}`)}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("data")}</CardTitle>
          <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-1 text-sm">
            <dt className="text-warm-600">{t("fiscalCode")}</dt>
            <dd>{c.fiscalCode ?? c.vatNumber ?? "—"}</dd>
            <dt className="text-warm-600">{t("birthDate")}</dt>
            <dd>{c.birthDate ? formatDate(c.birthDate) : "—"}</dd>
            <dt className="text-warm-600">{t("email")}</dt>
            <dd>{c.email ?? "—"}</dd>
            <dt className="text-warm-600">{t("phone")}</dt>
            <dd>{c.phone ?? "—"}</dd>
            <dt className="text-warm-600">{t("vehicles")}</dt>
            <dd>{c.vehicles.join(", ") || "—"}</dd>
          </dl>
          <a href={`/clienti/${c.id}/dati`} className="mt-3 inline-block text-sm underline">
            {t("export")}
          </a>
        </Card>

        <Card>
          <CardTitle>{t("requestsTitle")}</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {c.requests.map((r) => (
              <li key={r.id}>
                {r.code} · {r.plate ?? "—"} · {t(`requestStatus.${r.status}`)} ·{" "}
                {formatDateTime(r.createdAt)}
              </li>
            ))}
          </ul>
          <h3 className="mt-4 font-semibold">{t("policies")}</h3>
          {c.policies.length === 0 ? (
            <p className="text-sm text-warm-600">—</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {c.policies.map((p) => (
                <li key={p.id}>
                  {p.number} · {p.requestCode} · {formatDate(p.startDate)} → {formatDate(p.endDate)}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>{t("consents")}</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {c.consents.map((x) => (
              <li key={`${x.type}-${x.acceptedAt}`}>
                {t(`consentTypes.${x.type}`)} · {formatDateTime(x.acceptedAt)}
                {x.revokedAt ? (
                  <>
                    {" "}
                    <Badge tone="danger">{t("revoked", { at: formatDateTime(x.revokedAt) })}</Badge>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>{t("dataRequests")}</CardTitle>
          {c.dataRequests.length === 0 ? (
            <p className="mt-2 text-sm text-warm-600">{t("noDataRequests")}</p>
          ) : (
            <ul className="mt-2 space-y-3 text-sm">
              {c.dataRequests.map((d) => (
                <li key={d.id}>
                  <span className="font-medium">{t(`kinds.${d.kind}`)}</span> ·{" "}
                  {t(`dsrStatus.${d.status}`)} · {t("dueAt", { at: formatDateTime(d.dueAt) })}
                  <span className="block text-warm-600">{d.description}</span>
                  {d.outcome ? <span className="block">{d.outcome}</span> : null}
                  {manage && d.status === "OPEN" ? (
                    <form action={closeDataRequest} className="mt-2 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="customerId" value={c.id} />
                      <label className="flex items-center gap-2">
                        <input type="radio" name="outcomeKind" value="done" required />
                        {t("closeDone")}
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="outcomeKind" value="rejected" />
                        {t("closeRejected")}
                      </label>
                      <label className="grid gap-1">
                        {t("outcome")}
                        <input name="outcome" required minLength={3} className={field} />
                      </label>
                      <Button type="submit" size="sm">
                        {t("close")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {manage ? (
            <form action={openDataRequest} className="mt-4 grid gap-2 text-sm">
              <input type="hidden" name="customerId" value={c.id} />
              <h3 className="font-semibold">{t("newDataRequest")}</h3>
              <label className="grid gap-1">
                {t("kind")}
                <select name="kind" className={field}>
                  {(["ACCESS", "RECTIFICATION", "ERASURE"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                {t("receivedOn")}
                <input type="date" name="receivedOn" required className={field} />
              </label>
              <label className="grid gap-1">
                {t("description")}
                <textarea name="description" required minLength={3} rows={2} className={field} />
              </label>
              <Button type="submit" size="sm" variant="outline" className="justify-self-start">
                {t("register")}
              </Button>
            </form>
          ) : null}
        </Card>

        <Card>
          <CardTitle>{t("tickets")}</CardTitle>
          {c.tickets.length === 0 ? (
            <p className="mt-2 text-sm text-warm-600">{t("noTickets")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {c.tickets.map((x) => (
                <li key={x.id}>
                  <Link href={`/assistenza/${x.id}`} className="underline">
                    {x.code}
                  </Link>{" "}
                  · {x.subject} · {t(`ticketStatus.${x.status}`)}
                </li>
              ))}
            </ul>
          )}
          {can(viewer.actor, "support.tickets") ? (
            <Link
              href={`/assistenza?cliente=${c.id}`}
              className="mt-3 inline-block text-sm underline"
            >
              {t("newTicket")}
            </Link>
          ) : null}
        </Card>

        <Card>
          <CardTitle>{t("accessLog")}</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {c.accessLog.map((a) => (
              <li key={`${a.at}-${a.action}`}>
                {formatDateTime(a.at)} · {a.who ?? t("system")}
                {a.whoKind ? ` (${t(`whoKinds.${a.whoKind}`)})` : ""} ·{" "}
                {t(`accessActions.${a.action}`)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}

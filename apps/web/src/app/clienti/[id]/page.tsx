import { formatDateTime } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createBrokerRequest } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/request-view";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface CustomerCard {
  id: string;
  name: string;
  person: { fiscalCode: string | null; vatNumber: string | null };
  contacts: { email: string | null; phone: string | null };
  consents: { method: string; acceptedAt: string; revokedAt: string | null }[];
  vehicles: { plate: string }[];
  requests: { id: string; code: string; status: string; plate: string | null; createdAt: string }[];
}

/** The customer card (spec 02 «Scheda cliente»); the API logs the opening. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const t = await getTranslations("customerCard");
  const tm = await getTranslations("wizard.brokerConsent.method");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { status, body: c } = await api<CustomerCard>(`/customers/${id}`);
  if (status === 404) notFound();
  const missing = t("missing");
  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{c.name}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("data")}</CardTitle>
          <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="text-warm-600">{t("fiscalCode")}</dt>
            <dd>{c.person.fiscalCode ?? c.person.vatNumber ?? missing}</dd>
            <dt className="text-warm-600">{t("email")}</dt>
            <dd>{c.contacts.email ?? missing}</dd>
            <dt className="text-warm-600">{t("phone")}</dt>
            <dd>{c.contacts.phone ?? missing}</dd>
            <dt className="text-warm-600">{t("vehicles")}</dt>
            <dd>{c.vehicles.map((v) => v.plate).join(", ") || missing}</dd>
          </dl>
        </Card>
        <Card>
          <CardTitle>{t("consents")}</CardTitle>
          {c.consents.length === 0 ? (
            <p className="mt-2 text-sm">{t("noConsent")}</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {c.consents.map((consent) => (
                <li key={consent.acceptedAt}>
                  {t("consentLine", {
                    method: tm(consent.method),
                    at: formatDateTime(consent.acceptedAt),
                  })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("requests")}</CardTitle>
          <form action={createBrokerRequest}>
            <input type="hidden" name="customerId" value={c.id} />
            <Button type="submit" size="sm">
              {t("newRequest")}
            </Button>
          </form>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {c.requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3">
              <Link href={`/richieste/${r.id}`} className="underline">
                {r.code}
              </Link>
              <span>{r.plate}</span>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  );
}

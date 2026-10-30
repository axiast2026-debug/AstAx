import { Button, buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createBrokerRequest, search } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary, Field } from "@/components/form";
import { api } from "@/lib/auth";
import { readSearch } from "@/lib/search";
import { requireViewer } from "@/lib/me";
import { Info } from "@/components/info";

interface CustomerRow {
  id: string;
  name: string;
  fiscalCode: string | null;
  vatNumber: string | null;
  vehicles: string[];
}

/** Step 1 of the broker's wizard: an existing customer or a new one (spec 02). */
export default async function NewBrokerRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("newBrokerRequest");
  const { errore } = await searchParams;
  const { q } = await readSearch("nuova-richiesta");
  const { body: customers } = q
    ? await api<CustomerRow[]>("/customers/search", { method: "POST", body: JSON.stringify({ q }) })
    : await api<CustomerRow[]>("/customers");
  return (
    <AppShell viewer={viewer}>
      <h1 className="font-display text-screen font-extrabold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
      <div className="mt-6">
        <ErrorSummary codes={errore} />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form action={search} className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="scope" value="nuova-richiesta" />
          <Field
            label={t("search")}
            name="q"
            hint={t("searchHint")}
            defaultValue={q}
            className="flex-1"
          />
          <Button type="submit" variant="outline">
            {t("find")}
          </Button>
        </form>
        {/* UX review 2026-10-23: a new customer is one tap away, not below the whole list. */}
        <Link
          href="/clienti/nuovo?poi=richiesta"
          className={buttonVariants({ variant: "secondary" })}
        >
          {t("newCustomer")}
        </Link>
      </div>
      <Card className="mt-6">
        <CardTitle>{t("choose")}</CardTitle>
        {customers.length === 0 ? (
          <p className="mt-2 text-sm">{t("none")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-warm-200">
            {customers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-warm-600">{c.fiscalCode ?? c.vatNumber}</p>
                </div>
                <form action={createBrokerRequest}>
                  <input type="hidden" name="customerId" value={c.id} />
                  <Button type="submit" size="sm" variant="outline">
                    {t("start")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}

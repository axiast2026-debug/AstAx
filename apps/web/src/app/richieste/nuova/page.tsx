import { Button, buttonVariants, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createBrokerRequest } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary, Field } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

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
  searchParams: Promise<{ q?: string; errore?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("newBrokerRequest");
  const { q, errore } = await searchParams;
  const search = q ? `?q=${encodeURIComponent(q.slice(0, 40))}` : "";
  const { body: customers } = await api<CustomerRow[]>(`/customers${search}`);
  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      <div className="mt-6">
        <ErrorSummary codes={errore} />
      </div>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                  <Button type="submit" size="sm">
                    {t("start")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Link
        href="/clienti/nuovo?poi=richiesta"
        className={`${buttonVariants({ variant: "secondary" })} mt-6`}
      >
        {t("newCustomer")}
      </Link>
    </AppShell>
  );
}

import { Button, buttonVariants } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface CustomerRow {
  id: string;
  name: string;
  fiscalCode: string | null;
  vatNumber: string | null;
  vehicles: string[];
  requests: number;
}

/** The broker's customers (spec 02 «Clienti»): exact search by fiscal code or by name. */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("customers");
  const { q } = await searchParams;
  const search = q ? `?q=${encodeURIComponent(q.slice(0, 40))}` : "";
  const { body: customers } = await api<CustomerRow[]>(`/customers${search}`);
  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href="/clienti/nuovo" className={buttonVariants()}>
          {t("new")}
        </Link>
      </div>
      <form className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
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
      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">{t("title")}</caption>
        <thead>
          <tr className="text-left text-warm-600">
            <th scope="col" className="py-2">
              {t("name")}
            </th>
            <th scope="col">{t("fiscalCode")}</th>
            <th scope="col">{t("vehicles")}</th>
            <th scope="col">{t("requests")}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-t border-warm-200">
              <td className="py-2">
                <Link href={`/clienti/${c.id}`} className="underline">
                  {c.name}
                </Link>
              </td>
              <td>{c.fiscalCode ?? c.vatNumber}</td>
              <td>{c.vehicles.join(", ")}</td>
              <td className="tabular">{c.requests}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {customers.length === 0 ? <p className="mt-4 text-sm">{t("empty")}</p> : null}
    </AppShell>
  );
}

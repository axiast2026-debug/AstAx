import { formatDateTime } from "@astax/shared/format";
import { Button, buttonVariants } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field, SelectField } from "@/components/form";
import { StatusBadge } from "@/components/request-view";
import { search } from "@/app/request-actions";
import { api } from "@/lib/auth";
import { readSearch } from "@/lib/search";
import { requireViewer } from "@/lib/me";
import type { RequestSummary } from "@/lib/requests";

const STATUSES = ["DRAFT", "IN_VERIFICATION", "INTEGRATION_REQUESTED", "EXCLUDED", "CANCELLED"];

/** The broker's requests with filters (spec 02 «Richieste»). */
export default async function BrokerRequestsPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("brokerRequests");
  const ts = await getTranslations("requestStatus");
  const saved = await readSearch("richieste");
  const query = { stato: saved.status ?? "", targa: saved.q ?? "" };
  const filter = {
    ...(STATUSES.includes(query.stato) ? { status: query.stato } : {}),
    ...(query.targa ? { q: query.targa } : {}),
  };
  const { body: requests } = await api<RequestSummary[]>("/requests/search", {
    method: "POST",
    body: JSON.stringify(filter),
  });
  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href="/richieste/nuova" className={buttonVariants()}>
          {t("new")}
        </Link>
      </div>
      <form
        action={search}
        className="mt-6 grid gap-4 rounded-xl border border-warm-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <input type="hidden" name="scope" value="richieste" />
        <SelectField
          label={t("status")}
          name="stato"
          placeholder={t("allStatuses")}
          options={STATUSES.map((code) => ({ code, label: ts(code) }))}
          defaultValue={query.stato}
        />
        <Field label={t("plate")} name="q" defaultValue={query.targa} />
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>
      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">{t("title")}</caption>
        <thead>
          <tr className="text-left text-warm-600">
            <th scope="col" className="py-2">
              {t("code")}
            </th>
            <th scope="col">{t("customer")}</th>
            <th scope="col">{t("plate")}</th>
            <th scope="col">{t("package")}</th>
            <th scope="col">{t("status")}</th>
            <th scope="col">{t("created")}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="border-t border-warm-200">
              <td className="py-2">
                <Link href={`/richieste/${r.id}`} className="underline">
                  {r.code}
                </Link>
              </td>
              <td>{r.customer}</td>
              <td>{r.plate}</td>
              <td>{r.packageCode}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td className="tabular">{formatDateTime(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 ? <p className="mt-4 text-sm">{t("empty")}</p> : null}
    </AppShell>
  );
}

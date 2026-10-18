import { formatDateTime } from "@astax/shared/format";
import { can } from "@astax/shared/permissions";
import { Button, Card, CardTitle } from "@astax/ui";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface Found {
  id: string;
  name: string;
  channel: "PRIVATE" | "BROKER";
  broker: string | null;
  requests: number;
}

interface OpenRequest {
  id: string;
  customerId: string;
  customer: string;
  kind: string;
  dueAt: string;
}

const field = "rounded-lg border border-warm-200 px-3 py-2";

/** Spec 06 «Clienti»: search by name, fiscal code or plate; the open data requests. */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("customersBo");
  const locale = (await getLocale()) === "sq" ? "sq" : "it";
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const found =
    q.length >= 2
      ? await api<Found[]>(`/back-office/customers?q=${encodeURIComponent(q)}`)
      : { status: 200, body: [] as Found[] };
  const open = can(viewer.actor, "dataSubjectRequest.manage")
    ? await api<OpenRequest[]>("/back-office/data-requests")
    : null;

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">
          {t("search")}
          <input name="q" defaultValue={q} minLength={2} className={field} />
        </label>
        <Button type="submit" size="sm">
          {t("find")}
        </Button>
      </form>
      {q.length >= 2 && found.status === 200 ? (
        <Card className="mt-6">
          <CardTitle>{t("results", { count: found.body.length })}</CardTitle>
          <ul className="mt-2 divide-y divide-warm-200 text-sm">
            {found.body.map((c) => (
              <li key={c.id} className="py-2">
                <Link href={`/clienti/${c.id}`} className="font-medium underline">
                  {c.name}
                </Link>
                <span className="block text-warm-600">
                  {c.channel === "BROKER"
                    ? t("ofBroker", { broker: c.broker ?? "" })
                    : t("private")}{" "}
                  · {t("requests", { count: c.requests })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {open?.status === 200 ? (
        <Card className="mt-6">
          <CardTitle>{t("openRequests")}</CardTitle>
          {open.body.length === 0 ? (
            <p className="mt-2 text-sm">{t("noOpenRequests")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {open.body.map((d) => (
                <li key={d.id}>
                  <Link href={`/clienti/${d.customerId}`} className="underline">
                    {d.customer}
                  </Link>{" "}
                  · {t(`kinds.${d.kind}`)} · {t("dueAt", { at: formatDateTime(d.dueAt, locale) })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </AppShell>
  );
}

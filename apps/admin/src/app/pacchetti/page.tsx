import { formatDateTime } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { newPackageVersion, saveExclusion } from "./actions";
import { Info } from "@/components/info";

interface PackageView {
  code: string;
  name: string;
  versions: {
    id: string;
    version: number;
    requirements: unknown;
    customerTextIt: string;
    validFrom: string;
    reason: string | null;
    inForce: boolean;
  }[];
}

interface Exclusion {
  code: string;
  version: number;
  blockingInWizard: boolean;
  automatic: boolean;
  messageIt: string;
  active: boolean;
  history: {
    version: number;
    active: boolean;
    messageIt: string;
    reason: string | null;
    at: string;
  }[];
}

const DONE = ["package", "exclusion"] as const;
const field = "rounded-lg border border-warm-200 px-3 py-2";

/**
 * «Pacchetti e casi esclusi» (spec 07): every package with its versions; a new
 * version starts at a date and only new requests use it (rule 7). The
 * excluded cases, with every version, the reason and the Albanian text.
 */
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("catalog");
  const query = await searchParams;
  const [packages, exclusions] = await Promise.all([
    api<PackageView[]>("/admin/packages"),
    api<Exclusion[]>("/admin/exclusion-rules"),
  ]);
  if (packages.status !== 200 || exclusions.status !== 200) notFound();
  const done = DONE.find((d) => d === query.fatto);

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {t("error", { code: query.errore })}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${done}`)}
        </p>
      ) : null}

      <h2 className="mt-8 text-xl font-semibold">{t("packages")}</h2>
      <div className="mt-3 space-y-4">
        {packages.body.map((p) => {
          const last = p.versions[0];
          return (
            <Card key={p.code}>
              <CardTitle>{p.name}</CardTitle>
              <ul className="mt-2 space-y-2 text-sm">
                {p.versions.map((v) => (
                  <li key={v.id}>
                    <details>
                      <summary className="cursor-pointer">
                        {t("version", { number: v.version })} ·{" "}
                        {t("from", { at: formatDateTime(v.validFrom) })}
                        {v.inForce ? ` · ${t("inForce")}` : ""}
                        {v.reason ? ` · ${v.reason}` : ""}
                      </summary>
                      <p className="mt-2">{v.customerTextIt}</p>
                      <pre className="mt-2 overflow-x-auto rounded bg-warm-100 p-2 text-xs">
                        {JSON.stringify(v.requirements, null, 2)}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer underline">{t("newVersion")}</summary>
                <form action={newPackageVersion} className="mt-3 grid gap-3">
                  <input type="hidden" name="code" value={p.code} />
                  <label className="grid gap-1">
                    {t("requirements")}
                    <textarea
                      name="requirements"
                      required
                      rows={12}
                      defaultValue={JSON.stringify(last?.requirements ?? {}, null, 2)}
                      className={`${field} font-mono text-xs`}
                    />
                  </label>
                  <label className="grid gap-1">
                    {t("customerTextIt")}
                    <textarea
                      name="customerTextIt"
                      required
                      rows={3}
                      defaultValue={last?.customerTextIt ?? ""}
                      className={field}
                    />
                  </label>
                  <label className="grid gap-1">
                    {t("validFrom")}
                    <input type="date" name="validFrom" required className={field} />
                  </label>
                  <label className="grid gap-1">
                    {t("reason")}
                    <input name="reason" required minLength={3} className={field} />
                  </label>
                  <Button type="submit" size="sm" className="justify-self-start">
                    {t("saveVersion")}
                  </Button>
                </form>
              </details>
            </Card>
          );
        })}
      </div>

      <h2 className="mt-10 text-xl font-semibold">
        {t("exclusions")}
        <Info>{t("exclusionsIntro")}</Info>
      </h2>
      <div className="mt-3 space-y-4">
        {exclusions.body.map((x) => (
          <Card key={x.code}>
            <CardTitle>
              {x.code} · {t("version", { number: x.version })}
              {x.active ? "" : ` · ${t("inactive")}`}
            </CardTitle>
            {x.automatic ? <p className="text-sm text-warm-600">{t("automatic")}</p> : null}
            <ExclusionForm exclusion={x} t={t} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer underline">{t("history")}</summary>
              <ul className="mt-2 space-y-1">
                {x.history.map((v) => (
                  <li key={v.version}>
                    {t("version", { number: v.version })} · {formatDateTime(v.at)} ·{" "}
                    {v.active ? t("active") : t("inactive")}
                    {v.reason ? ` · ${v.reason}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        ))}
        <Card>
          <CardTitle>{t("newExclusion")}</CardTitle>
          <ExclusionForm t={t} />
        </Card>
      </div>
    </AppShell>
  );
}

function ExclusionForm({
  exclusion,
  t,
}: {
  exclusion?: Exclusion;
  t: Awaited<ReturnType<typeof getTranslations<"catalog">>>;
}) {
  return (
    <form action={saveExclusion} className="mt-3 grid gap-3 text-sm md:grid-cols-2">
      {exclusion ? (
        <input type="hidden" name="code" value={exclusion.code} />
      ) : (
        <>
          <input type="hidden" name="create" value="1" />
          <label className="grid gap-1 md:col-span-2">
            {t("code")}
            <input name="code" required pattern="[A-Z][A-Z0-9_]*" className={field} />
          </label>
        </>
      )}
      <label className="grid gap-1">
        {t("messageIt")}
        <input name="messageIt" required defaultValue={exclusion?.messageIt} className={field} />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="blockingInWizard"
          defaultChecked={exclusion?.blockingInWizard ?? true}
        />
        {t("blockingInWizard")}
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={exclusion?.active ?? true} />
        {t("active")}
      </label>
      <label className="grid gap-1 md:col-span-2">
        {t("reason")}
        <input name="reason" required minLength={3} className={field} />
      </label>
      <Button type="submit" size="sm" variant="outline" className="justify-self-start">
        {exclusion ? t("saveExclusion") : t("createExclusion")}
      </Button>
    </form>
  );
}

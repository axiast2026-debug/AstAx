import { formatDate } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { saveAgencyFilters, saveCapacity, saveMyFilters } from "@/app/agency-settings-actions";
import { AppShell } from "@/components/app-shell";
import { CheckField, ErrorSummary, Field } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";

interface Criteria {
  vehicleTypes: string[];
  provinces: string[] | null;
  cuClassMin: number;
  cuClassMax: number;
  maxClaimsLast5y: number | null;
  driverAgeMin: number;
  driverAgeMax: number;
  packages: string[];
  companies: string[];
  maxStartDateDays: number;
  maxGuaranteeDays: number;
  acceptsWithoutDocuments?: boolean;
}
interface FiltersPage {
  agency: Criteria | null;
  mine: Criteria | null;
  capacity: {
    dailyMax: number | null;
    receptionHours: Record<string, [string, string][]>;
    pausedUntil: string | null;
    distribution: "ALL_USERS" | "BY_MEMBER_FILTERS";
  } | null;
  canManageAgency: boolean;
  appliesToMe: boolean;
  choices: {
    companies: { id: string; name: string }[];
    packages: { code: string; name: string }[];
    vehicleTypes: { code: string; label: string }[];
  };
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** The criteria of a filter (ASTA-05), the same fields for the agency and for a member. */
async function CriteriaFields({
  prefix,
  value,
  choices,
}: {
  prefix: string;
  value: Criteria | null;
  choices: FiltersPage["choices"];
}) {
  const t = await getTranslations("agencySettings.criteria");
  const checks = (name: string, options: { code: string; label: string }[], chosen: string[]) => (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm font-medium">{t(name)}</legend>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
        {options.map((o) => (
          <CheckField
            key={o.code}
            label={o.label}
            name={`${prefix}.${name}`}
            value={o.code}
            defaultChecked={value ? chosen.includes(o.code) : true}
          />
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {checks("vehicleTypes", choices.vehicleTypes, value?.vehicleTypes ?? [])}
      {checks(
        "packages",
        choices.packages.map((p) => ({ code: p.code, label: p.name })),
        value?.packages ?? [],
      )}
      {checks(
        "companies",
        choices.companies.map((c) => ({ code: c.id, label: c.name })),
        value?.companies ?? [],
      )}
      <Field
        className="sm:col-span-2"
        label={t("provinces")}
        name={`${prefix}.provinces`}
        hint={t("provincesHint")}
        defaultValue={value?.provinces?.join(", ") ?? ""}
      />
      <Field
        label={t("cuClassMin")}
        name={`${prefix}.cuClassMin`}
        type="number"
        min={1}
        max={18}
        defaultValue={value?.cuClassMin ?? 1}
      />
      <Field
        label={t("cuClassMax")}
        name={`${prefix}.cuClassMax`}
        type="number"
        min={1}
        max={18}
        defaultValue={value?.cuClassMax ?? 18}
      />
      <Field
        label={t("driverAgeMin")}
        name={`${prefix}.driverAgeMin`}
        type="number"
        min={18}
        defaultValue={value?.driverAgeMin ?? 18}
      />
      <Field
        label={t("driverAgeMax")}
        name={`${prefix}.driverAgeMax`}
        type="number"
        max={120}
        defaultValue={value?.driverAgeMax ?? 99}
      />
      <Field
        label={t("maxClaims")}
        name={`${prefix}.maxClaimsLast5y`}
        type="number"
        min={0}
        hint={t("maxClaimsHint")}
        defaultValue={value?.maxClaimsLast5y ?? ""}
      />
      <Field
        label={t("maxStartDateDays")}
        name={`${prefix}.maxStartDateDays`}
        type="number"
        min={1}
        defaultValue={value?.maxStartDateDays ?? 60}
      />
      <Field
        label={t("maxGuaranteeDays")}
        name={`${prefix}.maxGuaranteeDays`}
        type="number"
        min={1}
        hint={t("maxGuaranteeHint")}
        defaultValue={value?.maxGuaranteeDays ?? 30}
      />
      <div className="sm:col-span-2">
        <CheckField
          label={t("acceptsWithoutDocuments")}
          name={`${prefix}.acceptsWithoutDocuments`}
          defaultChecked={value?.acceptsWithoutDocuments === true}
        />
        <p className="mt-1 text-xs text-warm-600">{t("acceptsWithoutDocumentsHint")}</p>
      </div>
    </div>
  );
}

/**
 * «Filtri e capacità» (spec 04, ASTA-05): the agency's filters and capacity
 * for the owner and the supervisors; personal filters for every member, only
 * narrowing the agency's (VIS-06).
 */
export default async function FiltersPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const t = await getTranslations("agencySettings");
  const query = await searchParams;
  const { body: page } = await api<FiltersPage>("/agency/filters");
  const hours = page.capacity?.receptionHours ?? {};

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">{t("filtersTitle")}</h1>
      <p className="mt-1 text-sm text-warm-600">{t("filtersIntro")}</p>
      <div className="mt-4">
        <ErrorSummary codes={query.errore} />
      </div>
      {query.fatto ? (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("saved")}
        </p>
      ) : null}

      <div className="grid gap-6">
        {page.canManageAgency ? (
          <>
            <Card>
              <CardTitle>{t("agencyFilters")}</CardTitle>
              <form action={saveAgencyFilters}>
                <CriteriaFields prefix="agency" value={page.agency} choices={page.choices} />
                <Button type="submit" className="mt-4">
                  {t("saveAgencyFilters")}
                </Button>
              </form>
            </Card>
            <Card>
              <CardTitle>{t("capacity")}</CardTitle>
              <form action={saveCapacity} className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("dailyMax")}
                  name="dailyMax"
                  type="number"
                  min={1}
                  hint={t("dailyMaxHint")}
                  defaultValue={page.capacity?.dailyMax ?? ""}
                />
                <Field
                  label={t("pausedUntil")}
                  name="pausedUntil"
                  type="date"
                  hint={
                    page.capacity?.pausedUntil
                      ? t("pausedNow", { date: formatDate(page.capacity.pausedUntil) })
                      : t("pausedHint")
                  }
                  defaultValue={page.capacity?.pausedUntil?.slice(0, 10) ?? ""}
                />
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-medium">{t("receptionHours")}</legend>
                  <p className="text-xs text-warm-600">{t("receptionHoursHint")}</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {WEEKDAYS.map((d) => (
                      <Field
                        key={d}
                        label={t(`weekdays.${d}`)}
                        name={`hours.${d}`}
                        defaultValue={(hours[d] ?? []).map(([a, b]) => `${a}-${b}`).join(", ")}
                      />
                    ))}
                  </div>
                </fieldset>
                <div className="sm:col-span-2">
                  <label htmlFor="f-distribution" className="block text-sm font-medium">
                    {t("distribution")}
                  </label>
                  <select
                    id="f-distribution"
                    name="distribution"
                    defaultValue={page.capacity?.distribution ?? "ALL_USERS"}
                    className="mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2"
                  >
                    <option value="ALL_USERS">{t("distributionAll")}</option>
                    <option value="BY_MEMBER_FILTERS">{t("distributionByMember")}</option>
                  </select>
                </div>
                <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
                  {t("saveCapacity")}
                </Button>
              </form>
            </Card>
          </>
        ) : null}

        <Card>
          <CardTitle>{t("myFilters")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">
            {page.appliesToMe ? t("myFiltersApply") : t("myFiltersNotApplied")}
          </p>
          {page.agency ? (
            <form action={saveMyFilters}>
              <CriteriaFields
                prefix="mine"
                value={page.mine ?? page.agency}
                choices={page.choices}
              />
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Button type="submit">{t("saveMyFilters")}</Button>
                {page.mine ? <CheckField label={t("removeMyFilters")} name="remove" /> : null}
              </div>
            </form>
          ) : (
            <p className="mt-2 text-sm">{t("noAgencyFilters")}</p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

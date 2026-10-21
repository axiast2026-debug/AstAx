import { CHOOSABLE_COVERAGES } from "@astax/shared/domain";
import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { saveCoverageStep } from "@/app/request-actions";
import { CheckField, Field, hasError } from "@/components/form";
import { extracted, latestDocument, type RequestDetail, type RequestOptions } from "@/lib/requests";
import { centsToEuros, PRIVATE_PACKAGES } from "@/lib/wizard-forms";

function Hidden({ detail, base, step }: { detail: RequestDetail; base: string; step: string }) {
  return (
    <>
      <input type="hidden" name="requestId" value={detail.id} />
      <input type="hidden" name="base" value={base} />
      <input type="hidden" name="step" value={step} />
    </>
  );
}

/**
 * Step 3: coverage. The packages and their texts come from the database
 * (seed/pacchetti.json, spec 09 §2); the start date is proposed from the
 * current policy's expiry.
 */
export async function CoverageStep({
  detail,
  options,
  base,
  errors,
}: {
  detail: RequestDetail;
  options: RequestOptions;
  base: string;
  errors?: string;
}) {
  const t = await getTranslations("wizard.coverage");
  const tc = await getTranslations("wizard");
  const titem = await getTranslations("agency.coverage");
  const terms = detail.draft?.request;
  // Dan, 2026-10-21: the private customer chooses «Consigliato» or «Su misura»;
  // the broker keeps the packages Base, Plus and Completo for now.
  const isPrivate = base === "/preventivi";
  const shown = options.packages.filter((p) =>
    isPrivate ? PRIVATE_PACKAGES.includes(p.code) : !PRIVATE_PACKAGES.includes(p.code),
  );
  const chosen = terms?.packageCode ?? shown[0]?.code ?? "BASE";
  const chosenCoverages: readonly string[] = terms?.coverages ?? [];
  // Proposed from the current policy: the history, or the risk certificate read by the bot.
  const proposedStart =
    terms?.startDate ??
    detail.draft?.history?.currentExpiryDate ??
    extracted(latestDocument(detail, "RISK_CERTIFICATE"), "expiryDate");
  const startMode = terms?.startMode ?? "DATE";
  return (
    <form action={saveCoverageStep} className="space-y-6">
      <Hidden detail={detail} base={base} step="copertura" />
      {/* Duration and validity keep their values until step 4. */}
      <input
        type="hidden"
        name="request.auctionDurationHours"
        value={terms?.auctionDurationHours ?? options.defaultAuctionDurationHours}
      />
      <input
        type="hidden"
        name="request.minValidityDays"
        value={terms?.minValidityDays ?? options.defaultMinValidityDays}
      />
      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-night-900">{t("package")}</legend>
        {shown.map((p) => (
          <div
            key={p.code}
            className="rounded-xl border border-warm-200 bg-white p-4 has-[:checked]:border-orange-500"
          >
            <div className="flex items-center gap-2">
              <input
                id={`package-${p.code}`}
                type="radio"
                name="request.packageCode"
                value={p.code}
                defaultChecked={chosen === p.code}
                className="h-4 w-4 accent-orange-500"
                aria-describedby={`package-${p.code}-text`}
              />
              <label htmlFor={`package-${p.code}`} className="font-semibold">
                {p.name}
              </label>
            </div>
            <p id={`package-${p.code}-text`} className="mt-2 text-sm text-warm-600">
              {p.description}
            </p>
            {p.code === "CUSTOM" ? (
              <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
                <legend className="text-sm font-semibold">{t("chooseCoverages")}</legend>
                {CHOOSABLE_COVERAGES.map((item) => (
                  <CheckField
                    key={item}
                    label={titem(item)}
                    name={`request.coverages.${item}`}
                    defaultChecked={chosenCoverages.includes(item)}
                  />
                ))}
              </fieldset>
            ) : null}
          </div>
        ))}
        {shown.map((p) => (
          <input
            key={p.code}
            type="hidden"
            name={`request.packageVersion.${p.code}`}
            value={p.version}
          />
        ))}
      </fieldset>
      {/* Question 1: three ways to start the cover; the date only for the first. */}
      <fieldset className="space-y-2 rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold text-night-900">{t("startMode")}</legend>
        {(["DATE", "ON_ISSUANCE", "MIDNIGHT_AFTER_DEADLINE"] as const).map((mode) => (
          <div key={mode} className="flex items-start gap-2">
            <input
              id={`start-${mode}`}
              type="radio"
              name="request.startMode"
              value={mode}
              defaultChecked={startMode === mode}
              className="mt-1 h-4 w-4 accent-orange-500"
              aria-describedby={`start-${mode}-text`}
            />
            <div>
              <label htmlFor={`start-${mode}`} className="text-sm font-semibold">
                {t(`startModes.${mode}.label`)}
              </label>
              <p id={`start-${mode}-text`} className="text-sm text-warm-600">
                {t(`startModes.${mode}.text`)}
              </p>
            </div>
          </div>
        ))}
      </fieldset>
      <div className="grid gap-4 rounded-xl border border-warm-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
        <Field
          label={t("startDate")}
          name="request.startDate"
          type="date"
          hint={t("startDateHint")}
          defaultValue={startMode === "DATE" ? proposedStart : undefined}
          invalid={hasError(errors, "request.startDate")}
        />
        <Field
          label={t("currentPremium")}
          name="request.currentPremium"
          inputMode="decimal"
          hint={t("currentPremiumHint")}
          defaultValue={centsToEuros(terms?.currentPremiumCents)}
        />
        <div className="sm:col-span-2">
          <CheckField
            label={t("blackBox")}
            name="request.blackBox"
            defaultChecked={terms?.blackBox ?? false}
          />
        </div>
        <p className="text-sm text-warm-600 sm:col-span-2">{t("annualOnly")}</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="lg">
          {tc("saveAndContinue")}
        </Button>
      </div>
    </form>
  );
}

/** Step 4: auction duration and minimum guaranteed validity, from the parameters in force (rule 7). */
export async function AuctionStep({
  detail,
  options,
  base,
}: {
  detail: RequestDetail;
  options: RequestOptions;
  base: string;
}) {
  const t = await getTranslations("wizard.auction");
  const tc = await getTranslations("wizard");
  const terms = detail.draft?.request;
  if (!terms) {
    return <p className="text-sm">{t("coverageFirst")}</p>;
  }
  return (
    <form action={saveCoverageStep} className="space-y-6">
      <Hidden detail={detail} base={base} step="asta" />
      <input type="hidden" name="request.packageCode" value={terms.packageCode} />
      <input type="hidden" name="request.packageVersion" value={terms.packageVersion} />
      <input type="hidden" name="request.startDate" value={terms.startDate} />
      <input type="hidden" name="request.startMode" value={terms.startMode ?? "DATE"} />
      {(terms.coverages ?? []).map((item) => (
        <input key={item} type="hidden" name={`request.coverages.${item}`} value="on" />
      ))}
      {terms.blackBox ? <input type="hidden" name="request.blackBox" value="on" /> : null}
      <input
        type="hidden"
        name="request.currentPremium"
        value={centsToEuros(terms.currentPremiumCents)}
      />
      <fieldset className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold">{t("duration")}</legend>
        <p className="text-sm text-warm-600">{t("durationIntro")}</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {options.auctionDurationsHours.map((hours) => (
            <div key={hours} className="flex items-center gap-2">
              <input
                id={`duration-${hours}`}
                type="radio"
                name="request.auctionDurationHours"
                value={hours}
                defaultChecked={terms.auctionDurationHours === hours}
                className="h-4 w-4 accent-orange-500"
              />
              <label htmlFor={`duration-${hours}`}>{t("hours", { hours })}</label>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold">{t("validity")}</legend>
        <p className="text-sm text-warm-600">{t("validityIntro")}</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {options.minValidityDaysOptions.map((days) => (
            <div key={days} className="flex items-center gap-2">
              <input
                id={`validity-${days}`}
                type="radio"
                name="request.minValidityDays"
                value={days}
                defaultChecked={terms.minValidityDays === days}
                className="h-4 w-4 accent-orange-500"
              />
              <label htmlFor={`validity-${days}`}>{t("days", { days })}</label>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" size="lg">
          {tc("saveAndContinue")}
        </Button>
      </div>
    </form>
  );
}

import { CHOOSABLE_COVERAGES } from "@astax/shared/domain";
import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { saveCoverageStep } from "@/app/request-actions";
import { CheckField, Field, hasError } from "@/components/form";
import { extracted, latestDocument, type RequestDetail, type RequestOptions } from "@/lib/requests";
import { ChoiceCard, StickyActions } from "./wizard-ui";
import { centsToEuros, REQUEST_PACKAGES } from "@/lib/wizard-forms";

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
  const ti = await getTranslations("wizard.intake");
  const terms = detail.draft?.request;
  // Dan, 2026-10-21: «Consigliato» or «Su misura», for the private customer and the broker.
  const shown = options.packages.filter((p) => REQUEST_PACKAGES.includes(p.code));
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
        <legend className="mb-3 text-section font-bold">{t("package")}</legend>
        {shown.map((p) => (
          <ChoiceCard
            key={p.code}
            id={`package-${p.code}`}
            name="request.packageCode"
            value={p.code}
            defaultChecked={chosen === p.code}
            label={p.name}
            text={p.description}
          />
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
      {shown.some((p) => p.code === "CUSTOM") ? (
        <fieldset className="grid gap-2 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] sm:grid-cols-2 sm:p-6">
          <legend className="sr-only">{t("chooseCoverages")}</legend>
          <p aria-hidden className="text-label font-semibold sm:col-span-2">
            {t("chooseCoverages")}
          </p>
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
      {/* Question 1: three ways to start the cover; the date only for the first. */}
      <fieldset className="space-y-3">
        <legend className="mb-3 text-section font-bold">{t("startMode")}</legend>
        {(["DATE", "ON_ISSUANCE", "MIDNIGHT_AFTER_DEADLINE"] as const).map((mode) => (
          <ChoiceCard
            key={mode}
            id={`start-${mode}`}
            name="request.startMode"
            value={mode}
            defaultChecked={startMode === mode}
            label={t(`startModes.${mode}.label`)}
            text={t(`startModes.${mode}.text`)}
          />
        ))}
      </fieldset>
      <div className="grid gap-4 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] sm:grid-cols-2 sm:p-6">
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
        <p className="text-table text-warm-600 sm:col-span-2">{t("annualOnly")}</p>
      </div>
      <StickyActions note={ti("savedNote")} aboveMenu={base === "/preventivi"}>
        <Button type="submit" size="lg" full className="md:w-auto">
          {tc("saveAndContinue")}
        </Button>
      </StickyActions>
    </form>
  );
}

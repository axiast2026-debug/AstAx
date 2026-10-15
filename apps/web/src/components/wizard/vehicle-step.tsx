import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { lookupPlate, saveVehicleStep, uploadDocument } from "@/app/request-actions";
import { CheckField, Field, Fieldset, SelectField, hasError } from "@/components/form";
import { extracted, latestDocument, type RequestDetail, type RequestOptions } from "@/lib/requests";
import { DocumentUpload } from "./document-upload";

/**
 * Step 1: the vehicle (plate with automatic data, registration certificate
 * read by the document reader) and its insurance history (risk certificate).
 * Spec 03 «Nuovo preventivo» 1 and 02 «Nuova richiesta» 2.
 */
export async function VehicleStep({
  detail,
  options,
  base,
  errors,
  hint,
  claimYears,
}: {
  detail: RequestDetail;
  options: RequestOptions;
  base: string;
  errors?: string;
  hint: Record<string, string> | null;
  claimYears: number[];
}) {
  const t = await getTranslations("wizard.vehicle");
  const tc = await getTranslations("wizard");
  const draft = detail.draft ?? {};
  const v = draft.vehicle;
  const h = draft.history;
  const registration = latestDocument(detail, "REGISTRATION_CERTIFICATE");
  const certificate = latestDocument(detail, "RISK_CERTIFICATE");
  // Values already saved win; then what the libretto says; then the plate lookup.
  const pick = (saved: unknown, field: string, hintField = field) =>
    saved === undefined ? (extracted(registration, field) ?? hint?.[hintField]) : String(saved);
  const lists = options.lists;
  const claim = (year: number, kind: "mainResponsibility" | "sharedResponsibility") =>
    h?.claims.find((c) => c.year === year)?.[kind];

  return (
    <div className="space-y-6">
      <DocumentUpload
        requestId={detail.id}
        base={base}
        step="veicolo"
        kind="REGISTRATION_CERTIFICATE"
        title={t("registrationTitle")}
        intro={t("registrationIntro")}
        current={registration?.fileName}
        action={uploadDocument}
      />

      <form action={lookupPlate} className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
        <input type="hidden" name="requestId" value={detail.id} />
        <input type="hidden" name="base" value={base} />
        <p className="text-sm text-warm-600">{t("lookupIntro")}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field
            label={t("plate")}
            name="lookup.plate"
            defaultValue={pick(v?.plate, "plate")}
            autoComplete="off"
            required
          />
          <SelectField
            label={t("type")}
            name="lookup.type"
            options={lists.vehicleType ?? []}
            defaultValue={pick(v?.type, "vehicleType")}
          />
          <Button type="submit" variant="outline">
            {t("lookup")}
          </Button>
        </div>
      </form>

      <form action={saveVehicleStep} className="space-y-6">
        <input type="hidden" name="requestId" value={detail.id} />
        <input type="hidden" name="base" value={base} />
        <Fieldset legend={t("vehicleData")}>
          <Field
            label={t("plate")}
            name="vehicle.plate"
            defaultValue={pick(v?.plate, "plate")}
            required
            invalid={hasError(errors, "vehicle.plate")}
          />
          <SelectField
            label={t("type")}
            name="vehicle.type"
            options={lists.vehicleType ?? []}
            defaultValue={pick(v?.type, "vehicleType")}
            required
          />
          <SelectField
            label={t("use")}
            name="vehicle.use"
            options={lists.vehicleUse ?? []}
            defaultValue={v?.use ?? "PRIVATE"}
          />
          <Field
            label={t("make")}
            name="vehicle.make"
            defaultValue={pick(v?.make, "make")}
            required
            invalid={hasError(errors, "vehicle.make")}
          />
          <Field
            label={t("model")}
            name="vehicle.model"
            defaultValue={pick(v?.model, "model")}
            required
          />
          <Field
            label={t("version")}
            name="vehicle.version"
            defaultValue={pick(v?.version, "version")}
          />
          <SelectField
            label={t("fuel")}
            name="vehicle.fuel"
            options={lists.fuel ?? []}
            placeholder={tc("choose")}
            defaultValue={pick(v?.fuel, "fuel")}
            required
          />
          <Field
            label={t("displacement")}
            name="vehicle.displacementCc"
            inputMode="numeric"
            defaultValue={pick(v?.displacementCc, "displacementCc")}
          />
          <Field
            label={t("power")}
            name="vehicle.powerKw"
            inputMode="numeric"
            defaultValue={pick(v?.powerKw, "powerKw")}
            required
            invalid={hasError(errors, "vehicle.powerKw")}
          />
          <Field
            label={t("firstRegistration")}
            name="vehicle.firstRegistrationDate"
            type="date"
            defaultValue={pick(v?.firstRegistrationDate, "firstRegistrationDate")}
            required
          />
          <Field
            label={t("purchaseDate")}
            name="vehicle.purchaseDate"
            type="date"
            defaultValue={v?.purchaseDate}
            required
            invalid={hasError(errors, "vehicle.purchaseDate")}
          />
          <div className="sm:pt-6">
            <CheckField
              label={t("isNew")}
              name="vehicle.isNew"
              defaultChecked={v?.isNew ?? false}
            />
          </div>
          <Field
            label={t("marketValue")}
            name="vehicle.marketValueEur"
            inputMode="numeric"
            hint={t("marketValueHint")}
            defaultValue={v?.marketValueEur?.toString()}
          />
          <SelectField
            label={t("nightParking")}
            name="vehicle.nightParking"
            options={lists.nightParking ?? []}
            placeholder={tc("optional")}
            defaultValue={v?.nightParking}
          />
          <SelectField
            label={t("annualKm")}
            name="vehicle.annualKmBand"
            options={lists.annualKmBand ?? []}
            placeholder={tc("optional")}
            defaultValue={v?.annualKmBand}
          />
          <div className="sm:pt-6">
            <CheckField
              label={t("satelliteAlarm")}
              name="vehicle.satelliteAlarm"
              defaultChecked={v?.satelliteAlarm ?? false}
            />
          </div>
        </Fieldset>

        <fieldset className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
          <legend className="px-1 text-base font-semibold text-night-900">
            {t("specialUses")}
          </legend>
          <p className="text-sm text-warm-600">{t("specialUsesIntro")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {options.specialUses.map((use) => (
              <CheckField
                key={use.code}
                label={use.label}
                name="specialUses"
                value={use.code}
                defaultChecked={(draft.specialUses ?? []).includes(use.code)}
              />
            ))}
          </div>
        </fieldset>

        <Fieldset legend={t("history")}>
          <SelectField
            label={t("provenance")}
            name="history.provenance"
            options={lists.provenance ?? []}
            placeholder={tc("choose")}
            defaultValue={h?.provenance}
            required
          />
          <Field
            label={t("cuClass")}
            name="history.cuClass"
            inputMode="numeric"
            hint={t("cuClassHint")}
            defaultValue={h?.cuClass?.toString() ?? extracted(certificate, "cuClass")}
            invalid={hasError(errors, "history.cuClass")}
          />
          <Field
            label={t("currentInsurer")}
            name="history.currentInsurer"
            defaultValue={
              h?.currentInsurer ?? extracted(certificate, "currentInsurer") ?? hint?.companyName
            }
          />
          <Field
            label={t("currentExpiry")}
            name="history.currentExpiryDate"
            type="date"
            defaultValue={h?.currentExpiryDate ?? extracted(certificate, "expiryDate")}
          />
          <Field
            label={t("riskUniqueId")}
            name="history.riskUniqueId"
            defaultValue={h?.riskUniqueId ?? extracted(certificate, "riskUniqueId")}
          />
          <Field
            label={t("familyPlate")}
            name="history.familyRc.plate"
            hint={t("familyHint")}
            defaultValue={h?.familyRc?.plate}
          />
          <Field
            label={t("familyFiscalCode")}
            name="history.familyRc.relativeFiscalCode"
            defaultValue={h?.familyRc?.relativeFiscalCode}
          />
          <div className="sm:col-span-2">
            <table className="w-full text-sm">
              <caption className="text-left font-medium text-night-900">{t("claims")}</caption>
              <thead>
                <tr className="text-left text-warm-600">
                  <th scope="col">{t("year")}</th>
                  <th scope="col">{t("claimsMain")}</th>
                  <th scope="col">{t("claimsShared")}</th>
                </tr>
              </thead>
              <tbody>
                {claimYears.map((year) => (
                  <tr key={year}>
                    <th scope="row" className="py-1 text-left font-normal">
                      {year}
                    </th>
                    <td className="py-1 pr-2">
                      <input
                        name={`claims.${year}.main`}
                        aria-label={t("claimsMainYear", { year })}
                        inputMode="numeric"
                        defaultValue={claim(year, "mainResponsibility")?.toString() ?? "0"}
                        className="w-20 rounded-lg border border-warm-200 px-2 py-1"
                      />
                    </td>
                    <td className="py-1">
                      <input
                        name={`claims.${year}.shared`}
                        aria-label={t("claimsSharedYear", { year })}
                        inputMode="numeric"
                        defaultValue={claim(year, "sharedResponsibility")?.toString() ?? "0"}
                        className="w-20 rounded-lg border border-warm-200 px-2 py-1"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Fieldset>

        <div className="flex justify-end">
          <Button type="submit" size="lg">
            {tc("saveAndContinue")}
          </Button>
        </div>
      </form>

      <DocumentUpload
        requestId={detail.id}
        base={base}
        step="veicolo"
        kind="RISK_CERTIFICATE"
        title={t("certificateTitle")}
        intro={t("certificateIntro")}
        current={certificate?.fileName}
        action={uploadDocument}
      />
    </div>
  );
}

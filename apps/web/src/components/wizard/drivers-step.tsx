import type { Address, NaturalPerson, PersonData } from "@astax/shared/domain";
import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { saveDriversStep, uploadDocument } from "@/app/request-actions";
import { CheckField, Field, Fieldset, SelectField, hasError } from "@/components/form";
import { extracted, latestDocument, type RequestDetail, type RequestOptions } from "@/lib/requests";
import { holderDrivesByDefault } from "@/lib/wizard-forms";
import { DocumentUpload } from "./document-upload";

interface Municipality {
  istatCode: string;
  name: string;
  province: string;
}

/**
 * Step 2: who signs, who owns the vehicle, who drives (spec 03 «Chi guida»,
 * spec 02 «Conducenti»). Birth date, sex and birth place are not asked: they
 * come from the fiscal code. Nationality is never asked (VIS-12).
 */
export async function DriversStep({
  detail,
  options,
  base,
  errors,
  municipalityNames,
  allowCompany,
}: {
  detail: RequestDetail;
  options: RequestOptions;
  base: string;
  errors?: string;
  municipalityNames: Map<string, Municipality>;
  allowCompany: boolean;
}) {
  const t = await getTranslations("wizard.drivers");
  const tc = await getTranslations("wizard");
  const draft = detail.draft ?? {};
  const holder = draft.policyHolder;
  const owner = draft.vehicleOwner;
  const drivers = draft.driving?.drivers ?? [];
  const main = drivers.find((d) => d.isMain);
  const holderDrives =
    !holder || (holder.kind === "PERSON" && holderDrivesByDefault(holder.fiscalCode, drivers));
  const other = drivers.find(
    (d) => d.person.fiscalCode !== (holder?.kind === "PERSON" ? holder.fiscalCode : ""),
  );
  const registration = latestDocument(detail, "REGISTRATION_CERTIFICATE");
  const licence0 = latestDocument(detail, "DRIVING_LICENCE", 0);
  const licence1 = latestDocument(detail, "DRIVING_LICENCE", 1);
  const lists = options.lists;

  const address = (a: Address | undefined) =>
    a ? municipalityNames.get(a.municipalityIstat) : undefined;

  const personFields = (
    prefix: string,
    person: NaturalPerson | undefined,
    fromDoc?: (f: string) => string | undefined,
  ) => (
    <>
      <Field
        label={t("surname")}
        name={`${prefix}.surname`}
        autoComplete="family-name"
        defaultValue={person?.surname ?? fromDoc?.("surname")}
      />
      <Field
        label={t("givenName")}
        name={`${prefix}.givenName`}
        autoComplete="given-name"
        defaultValue={person?.givenName ?? fromDoc?.("givenName")}
      />
      <Field
        label={t("fiscalCode")}
        name={`${prefix}.fiscalCode`}
        hint={t("fiscalCodeHint")}
        autoComplete="off"
        defaultValue={person?.fiscalCode ?? fromDoc?.("fiscalCode")}
        invalid={hasError(errors, `${prefix}.fiscalCode`)}
      />
      <Field
        label={t("street")}
        name={`${prefix}.street`}
        autoComplete="street-address"
        defaultValue={person?.residence.street ?? fromDoc?.("street")}
      />
      <Field
        label={t("postalCode")}
        name={`${prefix}.postalCode`}
        inputMode="numeric"
        autoComplete="postal-code"
        defaultValue={person?.residence.postalCode ?? fromDoc?.("postalCode")}
      />
      <Field
        label={t("municipality")}
        name={`${prefix}.municipality`}
        defaultValue={address(person?.residence)?.name ?? fromDoc?.("municipality")}
        invalid={hasError(errors, `${prefix}.municipality`)}
      />
      <Field
        label={t("province")}
        name={`${prefix}.province`}
        maxLength={2}
        defaultValue={person?.residence.province ?? fromDoc?.("province")}
      />
    </>
  );

  const licenceFields = (
    prefix: string,
    licence: (typeof drivers)[number]["licence"] | undefined,
    doc: typeof licence0,
  ) => (
    <>
      <SelectField
        label={t("licenceCategory")}
        name={`${prefix}.licence.category`}
        options={lists.licenceCategory ?? []}
        defaultValue={licence?.category ?? extracted(doc, "category") ?? "B"}
      />
      <Field
        label={t("licenceNumber")}
        name={`${prefix}.licence.number`}
        autoComplete="off"
        defaultValue={licence?.number ?? extracted(doc, "number")}
      />
      <Field
        label={t("licenceIssued")}
        name={`${prefix}.licence.issuedOn`}
        type="date"
        defaultValue={licence?.issuedOn ?? extracted(doc, "issuedOn")}
      />
      <Field
        label={t("licenceExpires")}
        name={`${prefix}.licence.expiresOn`}
        type="date"
        defaultValue={licence?.expiresOn ?? extracted(doc, "expiresOn")}
      />
    </>
  );

  // The owner on the registration certificate, to prefill the holder the first time.
  const fromRegistration = (field: string) => {
    const map: Record<string, string> = {
      surname: "ownerSurname",
      givenName: "ownerGivenName",
      fiscalCode: "ownerFiscalCode",
      street: "ownerStreet",
      postalCode: "ownerPostalCode",
      province: "ownerProvince",
    };
    if (field === "municipality") {
      const istat = extracted(registration, "ownerMunicipalityIstat");
      return istat ? municipalityNames.get(istat)?.name : undefined;
    }
    const key = map[field];
    return key ? extracted(registration, key) : undefined;
  };
  const holderPerson = holder?.kind === "PERSON" ? holder : undefined;
  const ownerPerson =
    owner && owner !== "SAME_AS_POLICY_HOLDER" && owner.kind === "PERSON" ? owner : undefined;
  const company = holder?.kind === "COMPANY" ? holder : undefined;

  return (
    <div className="space-y-6">
      <DocumentUpload
        requestId={detail.id}
        base={base}
        step="conducenti"
        kind="DRIVING_LICENCE"
        driverIndex={0}
        title={t("licenceTitle")}
        intro={t("licenceIntro")}
        current={licence0?.fileName}
        action={uploadDocument}
      />
      <form action={saveDriversStep} className="space-y-6">
        <input type="hidden" name="requestId" value={detail.id} />
        <input type="hidden" name="base" value={base} />
        {allowCompany ? (
          <SelectField
            label={t("holderKind")}
            name="policyHolder.kind"
            options={options.lists.contractorType ?? []}
            defaultValue={holder?.kind ?? "PERSON"}
          />
        ) : (
          <input type="hidden" name="policyHolder.kind" value="PERSON" />
        )}
        <Fieldset legend={t("holder")}>
          {personFields("policyHolder", holderPerson, holderPerson ? undefined : fromRegistration)}
          <SelectField
            label={t("profession")}
            name="policyHolder.profession"
            options={lists.profession ?? []}
            placeholder={tc("optional")}
            defaultValue={holderPerson?.profession}
          />
          <SelectField
            label={t("maritalStatus")}
            name="policyHolder.maritalStatus"
            options={lists.maritalStatus ?? []}
            placeholder={tc("optional")}
            defaultValue={holderPerson?.maritalStatus}
          />
          {allowCompany ? (
            <>
              <Field
                label={t("companyName")}
                name="policyHolder.companyName"
                hint={t("companyHint")}
                defaultValue={company?.companyName}
              />
              <Field
                label={t("vatNumber")}
                name="policyHolder.vatNumber"
                defaultValue={company?.vatNumber}
              />
            </>
          ) : null}
        </Fieldset>

        <Fieldset legend={t("owner")}>
          <div className="sm:col-span-2">
            <CheckField
              label={t("ownerIsHolder")}
              name="ownerIsHolder"
              defaultChecked={!ownerPerson}
            />
          </div>
          {personFields("vehicleOwner", ownerPerson)}
        </Fieldset>

        <Fieldset legend={t("mainDriver")}>
          <div className="sm:col-span-2">
            <CheckField
              label={t("holderDrives")}
              name="holderDrives"
              defaultChecked={holderDrives}
            />
          </div>
          {licenceFields("driver0", holderDrives ? main?.licence : undefined, licence0)}
        </Fieldset>

        <Fieldset legend={t("otherDriver")}>
          <div className="sm:col-span-2">
            <CheckField
              label={t("addOtherDriver")}
              name="otherDriver"
              defaultChecked={Boolean(other)}
            />
          </div>
          {personFields("driver1", other?.person)}
          {licenceFields("driver1", other?.licence, licence1)}
        </Fieldset>

        <fieldset className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
          <legend className="px-1 text-base font-semibold text-night-900">{t("formula")}</legend>
          <p className="text-sm text-warm-600">
            {t("formulaIntro", { age: options.expertMinAge })}
          </p>
          <div className="mt-3 space-y-2">
            {(lists.drivingFormula ?? []).map((f) => (
              <div key={f.code} className="flex items-center gap-2">
                <input
                  id={`formula-${f.code}`}
                  type="radio"
                  name="drivingFormula"
                  value={f.code}
                  defaultChecked={(draft.driving?.drivingFormula ?? "FREE") === f.code}
                  className="h-4 w-4 accent-orange-500"
                />
                <label htmlFor={`formula-${f.code}`} className="text-sm">
                  {f.label}
                </label>
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
      <DocumentUpload
        requestId={detail.id}
        base={base}
        step="conducenti"
        kind="DRIVING_LICENCE"
        driverIndex={1}
        title={t("licenceOtherTitle")}
        intro={t("licenceIntro")}
        current={licence1?.fileName}
        action={uploadDocument}
      />
    </div>
  );
}

export function holderName(person: PersonData | undefined): string {
  if (!person) return "";
  return person.kind === "COMPANY" ? person.companyName : `${person.givenName} ${person.surname}`;
}

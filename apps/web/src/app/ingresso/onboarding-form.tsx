import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { Field, Fieldset } from "@/components/form";

/**
 * Who enters: an agency (A), a broker (B) or an intermediary of section E who
 * asks for quotes like a broker (Dan, 2026-10-21, docs/piano-broker.md A).
 */
export type OnboardingKind = "AGENCY" | "BROKER" | "E";

export function kindOf(values: { type: "AGENCY" | "BROKER"; ruiNumber: string }): OnboardingKind {
  return values.type === "BROKER" && values.ruiNumber.startsWith("E") ? "E" : values.type;
}

export interface OnboardingValues {
  type: "AGENCY" | "BROKER";
  legalName: string;
  vatNumber: string;
  fiscalCode: string | null;
  ruiNumber: string;
  principalRuiNumber: string | null;
  pec: string;
  address: { street: string; postalCode: string; municipalityIstat: string; province: string };
  owner: { firstName: string; lastName: string; email: string; phone: string };
  companyIds: string[];
}

/** The data of the entry: the same form to start and to correct. */
export async function OnboardingForm({
  kind,
  companies,
  values,
  token,
  action,
}: {
  kind: OnboardingKind;
  companies: { id: string; name: string }[];
  values?: OnboardingValues;
  token?: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const t = await getTranslations("onboarding");
  const type = kind === "AGENCY" ? "AGENCY" : "BROKER";
  const section = kind === "AGENCY" ? "A" : kind === "BROKER" ? "B" : "E";
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="type" value={type} />
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <Fieldset legend={t("company")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("legalName")}
            name="legalName"
            required
            defaultValue={values?.legalName}
            hint={t("legalNameHint")}
            className="sm:col-span-2"
          />
          <Field
            label={t("vatNumber")}
            name="vatNumber"
            required
            defaultValue={values?.vatNumber}
          />
          <Field
            label={t("fiscalCode")}
            name="fiscalCode"
            defaultValue={values?.fiscalCode ?? ""}
            hint={t("optional")}
          />
          <Field
            label={t(`ruiNumber${section}`)}
            name="ruiNumber"
            required
            pattern={`[${section}${section.toLowerCase()}]\\d{9}`}
            defaultValue={values?.ruiNumber}
          />
          {kind === "E" ? (
            <Field
              label={t("principalRuiNumber")}
              name="principalRuiNumber"
              required
              pattern="[AaBb]\d{9}"
              hint={t("principalRuiNumberHint")}
              defaultValue={values?.principalRuiNumber ?? ""}
            />
          ) : null}
          <Field label={t("pec")} name="pec" type="email" required defaultValue={values?.pec} />
        </div>
      </Fieldset>
      <Fieldset legend={t("address")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("street")}
            name="street"
            required
            defaultValue={values?.address.street}
            className="sm:col-span-2"
          />
          <Field
            label={t("postalCode")}
            name="postalCode"
            required
            pattern="\d{5}"
            defaultValue={values?.address.postalCode}
          />
          <Field
            label={t("province")}
            name="province"
            required
            pattern="[A-Za-z]{2}"
            defaultValue={values?.address.province}
          />
          <Field
            label={t("municipalityIstat")}
            name="municipalityIstat"
            required
            pattern="\d{6}"
            hint={t("municipalityIstatHint")}
            defaultValue={values?.address.municipalityIstat}
          />
        </div>
      </Fieldset>
      <Fieldset legend={t("owner")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("firstName")}
            name="firstName"
            required
            defaultValue={values?.owner.firstName}
          />
          <Field
            label={t("lastName")}
            name="lastName"
            required
            defaultValue={values?.owner.lastName}
          />
          <Field
            label={t("email")}
            name="email"
            type="email"
            required
            defaultValue={values?.owner.email}
          />
          <Field
            label={t("phone")}
            name="phone"
            type="tel"
            required
            hint={t("phoneHint")}
            defaultValue={values?.owner.phone}
          />
        </div>
      </Fieldset>
      <Fieldset legend={t("iban")}>
        <Field
          label={t("iban")}
          name="iban"
          required
          autoComplete="off"
          hint={t(values ? "ibanAgainHint" : "ibanHint")}
        />
      </Fieldset>
      {type === "AGENCY" ? (
        <Fieldset legend={t("mandates")}>
          <p className="text-sm text-warm-600">{t("mandatesHint")}</p>
          <ul className="mt-2 space-y-2 text-sm">
            {companies.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="companyIds"
                    value={c.id}
                    defaultChecked={values?.companyIds.includes(c.id)}
                  />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </Fieldset>
      ) : null}
      <Button type="submit">{t(values ? "saveChanges" : "start")}</Button>
    </form>
  );
}

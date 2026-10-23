import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { createCustomer } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary, Field, Fieldset, SelectField } from "@/components/form";
import { requireViewer } from "@/lib/me";

/** A new customer of the broker: contacts stay with the broker, never in the auction (VIS-01). */
export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; poi?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("newCustomer");
  const { errore, poi } = await searchParams;
  return (
    <AppShell viewer={viewer}>
      <h1 className="font-display text-screen font-extrabold">{t("title")}</h1>
      <div className="mt-6">
        <ErrorSummary codes={errore} />
      </div>
      <form action={createCustomer} className="space-y-6">
        {poi === "richiesta" ? <input type="hidden" name="then" value="request" /> : null}
        <SelectField
          label={t("kind")}
          name="kind"
          options={[
            { code: "PERSON", label: t("person") },
            { code: "COMPANY", label: t("company") },
          ]}
          defaultValue="PERSON"
        />
        {/* Only the fields of the chosen kind (globals.css, data-shows-when). */}
        <div data-shows-when="person">
          <Fieldset legend={t("person")}>
            <Field label={t("surname")} name="surname" autoComplete="off" />
            <Field label={t("givenName")} name="givenName" autoComplete="off" />
            <Field
              label={t("fiscalCode")}
              name="fiscalCode"
              autoComplete="off"
              autoCapitalize="characters"
              hint={t("fiscalCodeHint")}
              className="sm:col-span-2"
            />
          </Fieldset>
        </div>
        <div data-shows-when="company">
          <Fieldset legend={t("company")}>
            <Field label={t("companyName")} name="companyName" autoComplete="off" />
            <Field label={t("vatNumber")} name="vatNumber" autoComplete="off" />
          </Fieldset>
        </div>
        <Fieldset legend={t("contacts")}>
          <Field label={t("email")} name="email" type="email" autoComplete="off" inputMode="email" />
          <Field label={t("phone")} name="phone" type="tel" autoComplete="off" inputMode="tel" />
          <p className="text-sm text-warm-600 sm:col-span-2">{t("contactsNote")}</p>
        </Fieldset>
        <Button type="submit" size="lg">
          {poi === "richiesta" ? t("saveAndStart") : t("save")}
        </Button>
      </form>
    </AppShell>
  );
}

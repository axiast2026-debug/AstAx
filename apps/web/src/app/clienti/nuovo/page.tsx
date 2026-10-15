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
      <h1 className="text-2xl font-bold">{t("title")}</h1>
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
        <Fieldset legend={t("person")}>
          <Field label={t("surname")} name="surname" autoComplete="off" />
          <Field label={t("givenName")} name="givenName" autoComplete="off" />
          <Field label={t("fiscalCode")} name="fiscalCode" autoComplete="off" />
        </Fieldset>
        <Fieldset legend={t("company")}>
          <Field label={t("companyName")} name="companyName" autoComplete="off" />
          <Field label={t("vatNumber")} name="vatNumber" autoComplete="off" />
        </Fieldset>
        <Fieldset legend={t("contacts")}>
          <Field label={t("email")} name="email" type="email" autoComplete="off" />
          <Field label={t("phone")} name="phone" type="tel" autoComplete="off" />
          <p className="text-sm text-warm-600 sm:col-span-2">{t("contactsNote")}</p>
        </Fieldset>
        <Button type="submit" size="lg">
          {poi === "richiesta" ? t("saveAndStart") : t("save")}
        </Button>
      </form>
    </AppShell>
  );
}

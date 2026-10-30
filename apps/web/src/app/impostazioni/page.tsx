import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary, Field } from "@/components/form";
import { Info } from "@/components/info";
import { MunicipalityField } from "@/components/wizard/municipality-field";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { can } from "@astax/shared/permissions";
import {
  changeSettingsIban,
  requestMandatesChange,
  saveOrganizationProfile,
  sendSettingsIbanCode,
} from "./actions";

interface Settings {
  type: "AGENCY" | "BROKER";
  legalName: string;
  vatNumber: string | null;
  ruiNumber: string | null;
  ruiSection: "A" | "B" | "E" | null;
  principalRuiNumber: string | null;
  pec: string | null;
  address: {
    street: string;
    postalCode: string;
    municipalityIstat: string;
    municipality: string;
    province: string;
  } | null;
  iban: string | null;
  mandates: { company: string; verified: boolean }[];
  phone: string | null;
}

/**
 * «Impostazioni» (audit of 2026-10-30, A3; spec 02 and 04): the owner of an
 * agency or a broker, a section E owner too, sees the data of the
 * organization, changes PEC and registered office, changes the IBAN with a
 * code by SMS and asks the back office to change the mandates.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; fatto?: string; iban?: string }>;
}) {
  const viewer = await requireViewer();
  if (!can(viewer.actor, "organization.editProfile")) notFound();
  const t = await getTranslations("organizationSettings");
  const tw = await getTranslations("wizard.intake");
  const query = await searchParams;
  const { body: s } = await api<Settings>("/organization/settings");
  const done = query.fatto ? t(`done.${query.fatto}`) : null;
  const codeSent = query.iban === "codice";
  const field = (label: string, value: string | null) => (
    <div className="contents">
      <dt className="text-warm-600">{label}</dt>
      <dd className="font-semibold">{value ?? "—"}</dd>
    </div>
  );

  return (
    <AppShell viewer={viewer}>
      <h1 className="text-2xl font-bold">
        {t("title")}
        <Info>{t("intro")}</Info>
      </h1>
      <div className="mt-4">
        <ErrorSummary codes={query.errore} />
      </div>
      {done ? (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm">
          {done}
        </p>
      ) : null}
      <div className="grid gap-6">
        <Card>
          <CardTitle>
            {t("dataTitle")}
            <Info>{t("dataIntro")}</Info>
          </CardTitle>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-x-4 gap-y-2 text-sm">
            {field(t("legalName"), s.legalName)}
            {field(t("vatNumber"), s.vatNumber)}
            {field(
              t("rui"),
              s.ruiNumber
                ? `${s.ruiNumber} · ${t("section", { section: s.ruiSection ?? "" })}`
                : null,
            )}
            {s.principalRuiNumber ? field(t("principal"), s.principalRuiNumber) : null}
          </dl>
          <ActionForm action={saveOrganizationProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              label={t("pec")}
              name="pec"
              type="email"
              required
              defaultValue={s.pec ?? ""}
              className="sm:col-span-2"
            />
            <Field
              label={t("street")}
              name="street"
              required
              defaultValue={s.address?.street ?? ""}
              className="sm:col-span-2"
            />
            <MunicipalityField
              prefix="address"
              initial={
                s.address
                  ? {
                      istatCode: s.address.municipalityIstat,
                      name: s.address.municipality,
                      province: s.address.province,
                      postalCodes: [s.address.postalCode],
                    }
                  : null
              }
              initialPostalCode={s.address?.postalCode}
              texts={{
                municipality: tw("municipality"),
                municipalityHint: tw("municipalityHint"),
                postalCode: tw("postalCode"),
                postalCodeChoose: tw("postalCodeChoose"),
                postalCodePlaceholder: tw("postalCodePlaceholder"),
                postalCodeFree: tw("postalCodeFree"),
                province: tw("province"),
                noResults: tw("municipalityNoResults"),
              }}
            />
            <div className="sm:col-span-2">
              <Button type="submit">{t("save")}</Button>
            </div>
          </ActionForm>
        </Card>

        <Card id="iban" className="scroll-mt-4">
          <CardTitle>
            {t("ibanTitle")}
            <Info>{t("ibanIntro")}</Info>
          </CardTitle>
          <p className="mt-2 text-sm">{s.iban ? t("ibanNow", { iban: s.iban }) : t("ibanNone")}</p>
          <ActionForm action={sendSettingsIbanCode} className="mt-4 flex flex-col gap-3">
            {s.phone ? (
              <p className="text-sm text-warm-700">{t("codeTo", { phone: s.phone })}</p>
            ) : (
              <Field label={t("phone")} name="phone" type="tel" required />
            )}
            <Button type="submit" variant={codeSent ? "outline" : "primary"} className="self-start">
              {codeSent ? t("sendAgain") : t("sendCode")}
            </Button>
          </ActionForm>
          {codeSent ? (
            <ActionForm action={changeSettingsIban} className="mt-4 flex flex-col gap-3">
              <Field label={t("iban")} name="iban" required autoComplete="off" />
              <Field
                label={t("code")}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                required
              />
              <Button type="submit" className="self-start">
                {t("confirmIban")}
              </Button>
            </ActionForm>
          ) : null}
        </Card>

        {s.type === "AGENCY" ? (
          <Card id="mandati" className="scroll-mt-4">
            <CardTitle>
              {t("mandatesTitle")}
              <Info>{t("mandatesIntro")}</Info>
            </CardTitle>
            <ul className="mt-3 flex flex-wrap gap-2">
              {s.mandates.map((m) => (
                <li key={m.company}>
                  <Badge tone={m.verified ? "success" : "neutral"}>
                    {m.company}
                    {m.verified ? "" : ` · ${t("notVerified")}`}
                  </Badge>
                </li>
              ))}
            </ul>
            <ActionForm action={requestMandatesChange} className="mt-4 flex flex-col gap-3">
              <label className="grid gap-1 text-label font-semibold">
                {t("mandatesRequest")}
                <textarea
                  name="text"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={3}
                  className="rounded-lg border border-warm-200 px-3 py-2 font-normal"
                />
              </label>
              <Button type="submit" variant="outline" className="self-start">
                {t("mandatesSend")}
              </Button>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

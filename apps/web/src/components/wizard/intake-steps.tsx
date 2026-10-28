import { CLASS_SOURCES, intakeDocuments, type Intake } from "@astax/shared/domain";
import { formatDate } from "@astax/shared/format";
import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import {
  confirmAndSubmit,
  removeDocumentFile,
  saveDrivingStep,
  saveIntakeStep,
  uploadDocument,
} from "@/app/request-actions";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field, hasError } from "@/components/form";
import type { MunicipalitySuggestion } from "@/app/riferimenti/comuni/route";
import { api } from "@/lib/auth";
import type { RequestDetail, RequestOptions } from "@/lib/requests";
import { DateField } from "./date-field";
import { MunicipalityField } from "./municipality-field";
import { PhotoUpload } from "./photo-upload";
import { ChoiceCard, ChoiceLink, StickyActions } from "./wizard-ui";

/**
 * The five screens of the private customer (Dan, 2026-10-21,
 * docs/piano-flusso-semplificato.md, ADR 0013): vehicle type, essential data
 * and photos, type of driving, coverages and start (CoverageStep), confirmation.
 */

type PartialIntake = Partial<Intake>;
const intakeOf = (detail: RequestDetail): PartialIntake =>
  (detail.draft?.intake ?? {}) as PartialIntake;

function Hidden({ detail, base }: { detail: RequestDetail; base: string }) {
  return (
    <>
      <input type="hidden" name="requestId" value={detail.id} />
      <input type="hidden" name="base" value={base} />
    </>
  );
}

/** Screen 1: «Già assicurato» or «Nuovo da assicurare». */
export async function VehicleTypeStep({ detail, base }: { detail: RequestDetail; base: string }) {
  const t = await getTranslations("wizard.intake");
  const current = intakeOf(detail).vehicleStatus;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["INSURED", "NEW"] as const).map((status) => (
        <ChoiceLink
          key={status}
          href={`${base}/${detail.id}/dati?stato=${status}`}
          label={t(`status.${status}.label`)}
          text={t(`status.${status}.text`)}
          selected={current === status}
        />
      ))}
    </div>
  );
}

/** Screen 2: the photos first (the bot reads them), then the few data to write. */
export async function IntakeDataStep({
  detail,
  base,
  errors,
  status,
  unreadable,
}: {
  detail: RequestDetail;
  base: string;
  errors?: string;
  status: "INSURED" | "NEW";
  unreadable?: string;
}) {
  const t = await getTranslations("wizard.intake");
  const intake = intakeOf(detail);
  // Dan, 2026-10-28: the fields are never filled from the bot's reading of the
  // documents; the customer writes the data, the back office sees the differences.
  const municipalityCode = intake.residence?.municipalityIstat;
  const municipality = municipalityCode
    ? ((await api<MunicipalitySuggestion[]>(`/reference/municipalities?q=${municipalityCode}`))
        .body[0] ?? null)
    : null;
  const photos = intakeDocuments({ vehicleStatus: status });
  const source = intake.classSource;
  // A broker's customer card already has the birth date (not a document reading).
  const proposedBirthDate = detail.customerBirthDate ?? undefined;
  return (
    <div className="space-y-6">
      <section aria-labelledby="photos" className="space-y-3">
        <h2 id="photos" className="sr-only">
          {t("photosTitle")}
        </h2>
        <p className="text-body text-warm-600">{t("photosIntro")}</p>
        {photos.map((kind) => {
          const files = detail.documents
            .filter((d) => d.kind === kind)
            .map((d) => ({ id: d.id, fileName: d.fileName }));
          return (
            <PhotoUpload
              key={kind}
              requestId={detail.id}
              base={base}
              step={`dati?stato=${status}`}
              kind={kind}
              title={t(`photos.${kind}.title`)}
              intro={t(`photos.${kind}.text`)}
              files={files}
              unreadable={unreadable === kind}
              action={uploadDocument}
              remove={removeDocumentFile}
            />
          );
        })}
      </section>

      <ActionForm action={saveIntakeStep} initialErrors={errors} className="space-y-6">
        <Hidden detail={detail} base={base} />
        <input type="hidden" name="intake.vehicleStatus" value={status} />
        <section className="grid gap-4 rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] sm:grid-cols-2 sm:p-6">
          <h2 className="text-section font-bold sm:col-span-2">{t("dataTitle")}</h2>
          <Field
            label={t("plate")}
            name="intake.plate"
            autoComplete="off"
            defaultValue={intake.plate}
            invalid={hasError(errors, "plate")}
            required
          />
          {detail.customerKind === "COMPANY" ? null : (
            // Typed or pasted (Dan, 2026-10-28); a broker's customer card proposes it.
            <DateField
              label={t("ownerBirthDate")}
              name="intake.ownerBirthDate"
              defaultValue={intake.ownerBirthDate ?? proposedBirthDate}
              hint={!intake.ownerBirthDate && proposedBirthDate ? t("fromCustomerCard") : undefined}
              invalid={hasError(errors, "ownerBirthDate")}
              autoComplete="bday"
              required
            />
          )}
          <Field
            label={t("street")}
            name="intake.street"
            autoComplete="street-address"
            defaultValue={intake.residence?.street}
            invalid={hasError(errors, "residence.street")}
            required
          />
          <MunicipalityField
            initial={municipality}
            initialPostalCode={intake.residence?.postalCode}
            invalid={hasError(errors, "intake.municipality")}
            postalCodeInvalid={hasError(errors, "residence.postalCode")}
            texts={{
              municipality: t("municipality"),
              municipalityHint: t("municipalityHint"),
              postalCode: t("postalCode"),
              postalCodeChoose: t("postalCodeChoose"),
              postalCodePlaceholder: t("postalCodePlaceholder"),
              postalCodeFree: t("postalCodeFree"),
              province: t("province"),
              noResults: t("municipalityNoResults"),
            }}
          />
        </section>

        {status === "NEW" ? (
          <fieldset className="space-y-3">
            <legend className="mb-3 text-section font-bold">{t("classTitle")}</legend>
            {CLASS_SOURCES.map((kind) => (
              <ChoiceCard
                key={kind}
                id={`class-${kind}`}
                name="intake.classSource"
                value={kind}
                defaultChecked={(source?.kind ?? "OWN_VEHICLE") === kind}
                label={t(`classSources.${kind}`)}
              />
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("otherPlate")}
                name="intake.otherPlate"
                hint={t("otherPlateHint")}
                autoComplete="off"
                defaultValue={source?.plate}
                invalid={hasError(errors, "classSource.plate")}
              />
              <DateField
                label={t("relativeBirthDate")}
                name="intake.relativeBirthDate"
                hint={t("relativeBirthDateHint")}
                defaultValue={source?.relativeBirthDate}
                invalid={hasError(errors, "classSource.relativeBirthDate")}
              />
            </div>
          </fieldset>
        ) : null}

        <StickyActions note={t("savedNote")} aboveMenu={base === "/preventivi"}>
          <Button type="submit" size="lg" full className="md:w-auto">
            {t("continue")}
          </Button>
        </StickyActions>
      </ActionForm>
    </div>
  );
}

/** Screen 3: the type of driving (required). */
export async function DrivingStep({
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
  const t = await getTranslations("wizard.intake");
  const chosen = intakeOf(detail).drivingFormula;
  return (
    <ActionForm action={saveDrivingStep} initialErrors={errors} className="space-y-6">
      <Hidden detail={detail} base={base} />
      <fieldset className="space-y-3">
        <legend className="mb-3 text-section font-bold">{t("drivingTitle")}</legend>
        {(options.lists.drivingFormula ?? []).map((f) => (
          <ChoiceCard
            key={f.code}
            id={`formula-${f.code}`}
            name="intake.drivingFormula"
            value={f.code}
            defaultChecked={chosen === f.code}
            required
            label={f.label}
            text={t(`driving.${f.code}`, { age: options.expertMinAge })}
          />
        ))}
      </fieldset>
      <StickyActions note={t("savedNote")} aboveMenu={base === "/preventivi"}>
        <Button type="submit" size="lg" full className="md:w-auto">
          {t("continue")}
        </Button>
      </StickyActions>
    </ActionForm>
  );
}

/**
 * Screen 5: what will be sent, one tick for the consents, «Invia». The broker
 * ticks nothing: its declaration covers its customers (docs/piano-broker.md, answer 3).
 */
export async function ConfirmStep({
  detail,
  options,
  base,
}: {
  detail: RequestDetail;
  options: RequestOptions;
  base: string;
}) {
  const t = await getTranslations("wizard.intake");
  const tc = await getTranslations("agency.coverage");
  const tm = await getTranslations("wizard.coverage");
  const intake = intakeOf(detail);
  const terms = detail.draft?.request;
  const pkg = options.packages.find((p) => p.code === terms?.packageCode);
  const formula = options.lists.drivingFormula?.find((f) => f.code === intake.drivingFormula);
  const broker = base === "/richieste";
  const consent = broker
    ? null
    : (
        await api<{ text: { title: string; contentMd: string; validated: boolean } }>(
          `/requests/${detail.id}/consent`,
        )
      ).body;
  const rows: [string, string][] = [
    [t("summary.vehicle"), intake.vehicleStatus ? t(`status.${intake.vehicleStatus}.label`) : ""],
    [t("plate"), intake.plate ?? ""],
    [t("ownerBirthDate"), intake.ownerBirthDate ? formatDate(intake.ownerBirthDate) : ""],
    [
      t("summary.residence"),
      intake.residence ? `${intake.residence.street}, ${intake.residence.postalCode}` : "",
    ],
    ...(intake.classSource
      ? ([
          [
            t("classTitle"),
            [t(`classSources.${intake.classSource.kind}`), intake.classSource.plate]
              .filter(Boolean)
              .join(" · "),
          ],
        ] as [string, string][])
      : []),
    [t("drivingTitle"), formula?.label ?? ""],
    [
      t("summary.start"),
      terms
        ? terms.startMode && terms.startMode !== "DATE"
          ? tm(`startModes.${terms.startMode}.label`)
          : formatDate(terms.startDate)
        : "",
    ],
    [
      t("summary.coverages"),
      terms?.packageCode === "CUSTOM"
        ? [tc("rca"), ...(terms.coverages ?? []).map((c) => tc(c))].join(", ")
        : (pkg?.name ?? ""),
    ],
    [
      t("summary.documents"),
      detail.documents
        .filter((d) =>
          [
            "REGISTRATION_CERTIFICATE",
            "DRIVING_LICENCE",
            "IDENTITY_DOCUMENT",
            "RISK_CERTIFICATE",
          ].includes(d.kind),
        )
        .map((d) => t(`photos.${d.kind}.title`))
        .join(", "),
    ],
  ];
  return (
    <form action={confirmAndSubmit} className="space-y-6">
      <Hidden detail={detail} base={base} />
      <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-white p-4 text-table shadow-[inset_0_0_0_1px_var(--color-warm-200)] sm:grid-cols-[12rem_1fr] sm:p-6">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-warm-600">{label}</dt>
            <dd className="font-medium">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      {consent ? (
        <section className="rounded-2xl bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-warm-200)] sm:p-6">
          <h2 className="text-section font-bold">{consent.text.title}</h2>
          <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-table text-night-900">
            {consent.text.contentMd}
          </div>
          <div className="mt-4">
            <CheckField label={t("consentTick")} name="consent" required />
          </div>
        </section>
      ) : (
        <p className="rounded-2xl bg-white p-4 text-table shadow-[inset_0_0_0_1px_var(--color-warm-200)] sm:p-6">
          {t("brokerDeclaration")}
        </p>
      )}
      <p className="rounded-xl bg-info-50 px-4 py-3 text-table text-night-900">
        {t("afterSubmit")}
      </p>
      <StickyActions note={t("savedNote")} aboveMenu={base === "/preventivi"}>
        <Button type="submit" size="lg" full className="md:w-auto">
          {t("submit")}
        </Button>
      </StickyActions>
    </form>
  );
}

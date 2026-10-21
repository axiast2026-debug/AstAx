import { CLASS_SOURCES, intakeDocuments, type Intake } from "@astax/shared/domain";
import { formatDate } from "@astax/shared/format";
import { Button, buttonVariants } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  confirmAndSubmit,
  saveDrivingStep,
  saveIntakeStep,
  uploadDocument,
} from "@/app/request-actions";
import { CheckField, Field, hasError } from "@/components/form";
import { api } from "@/lib/auth";
import { extracted, latestDocument, type RequestDetail, type RequestOptions } from "@/lib/requests";
import { PhotoUpload } from "./photo-upload";

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
    <div className="grid gap-4 sm:grid-cols-2">
      {(["INSURED", "NEW"] as const).map((status) => (
        <Link
          key={status}
          href={`${base}/${detail.id}/dati?stato=${status}`}
          className={buttonVariants({
            variant: current === status ? "primary" : "outline",
            size: "lg",
            className: "h-auto flex-col items-start gap-1 whitespace-normal py-5 text-left",
          })}
        >
          <span className="text-lg font-semibold">{t(`status.${status}.label`)}</span>
          <span className="text-sm font-normal">{t(`status.${status}.text`)}</span>
        </Link>
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
  const registration = latestDocument(detail, "REGISTRATION_CERTIFICATE");
  // The bot's reading of the registration proposes plate and address.
  const fromRegistration = (field: string) => extracted(registration, field);
  // The town from the saved data, or the one the bot read on the registration.
  const municipalityCode =
    intake.residence?.municipalityIstat ?? fromRegistration("ownerMunicipalityIstat");
  const municipalityName = municipalityCode
    ? (await api<{ name: string }[]>(`/reference/municipalities?q=${municipalityCode}`)).body[0]
        ?.name
    : undefined;
  const photos = [
    ...intakeDocuments({ vehicleStatus: status }),
    // Optional: with the risk certificate the bot reads class and claims too.
    ...(status === "INSURED" ? ["RISK_CERTIFICATE"] : []),
  ];
  const source = intake.classSource;
  return (
    <div className="space-y-6">
      <section aria-labelledby="photos" className="space-y-3">
        <h2 id="photos" className="text-lg font-semibold">
          {t("photosTitle")}
        </h2>
        <p className="text-sm text-warm-600">{t("photosIntro")}</p>
        {photos.map((kind) => {
          const doc = latestDocument(detail, kind, kind === "DRIVING_LICENCE" ? 0 : undefined);
          return (
            <PhotoUpload
              key={kind}
              requestId={detail.id}
              base={base}
              step={`dati?stato=${status}`}
              kind={kind}
              driverIndex={kind === "DRIVING_LICENCE" ? 0 : undefined}
              title={t(`photos.${kind}.title`)}
              intro={t(`photos.${kind}.text`)}
              current={doc?.fileName}
              unreadable={unreadable === kind}
              action={uploadDocument}
            />
          );
        })}
      </section>

      <form action={saveIntakeStep} className="space-y-6">
        <Hidden detail={detail} base={base} />
        <input type="hidden" name="intake.vehicleStatus" value={status} />
        <section className="grid gap-4 rounded-xl border border-warm-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
          <h2 className="text-lg font-semibold sm:col-span-2">{t("dataTitle")}</h2>
          <Field
            label={t("plate")}
            name="intake.plate"
            autoComplete="off"
            defaultValue={intake.plate ?? fromRegistration("plate")}
            invalid={hasError(errors, "plate")}
            required
          />
          <Field
            label={t("ownerBirthDate")}
            name="intake.ownerBirthDate"
            type="date"
            defaultValue={intake.ownerBirthDate}
            invalid={hasError(errors, "ownerBirthDate")}
            required
          />
          <Field
            label={t("street")}
            name="intake.street"
            autoComplete="street-address"
            defaultValue={intake.residence?.street ?? fromRegistration("ownerStreet")}
            required
          />
          <Field
            label={t("postalCode")}
            name="intake.postalCode"
            inputMode="numeric"
            autoComplete="postal-code"
            defaultValue={intake.residence?.postalCode ?? fromRegistration("ownerPostalCode")}
            required
          />
          <Field
            label={t("municipality")}
            name="intake.municipality"
            defaultValue={municipalityName}
            invalid={hasError(errors, "intake.municipality")}
            required
          />
          <Field
            label={t("province")}
            name="intake.province"
            maxLength={2}
            defaultValue={intake.residence?.province ?? fromRegistration("ownerProvince")}
            required
          />
        </section>

        {status === "NEW" ? (
          <fieldset className="space-y-3 rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
            <legend className="px-1 text-lg font-semibold">{t("classTitle")}</legend>
            {CLASS_SOURCES.map((kind) => (
              <div key={kind} className="flex items-start gap-2">
                <input
                  id={`class-${kind}`}
                  type="radio"
                  name="intake.classSource"
                  value={kind}
                  defaultChecked={(source?.kind ?? "OWN_VEHICLE") === kind}
                  className="mt-1 h-4 w-4 accent-orange-500"
                />
                <label htmlFor={`class-${kind}`} className="text-sm">
                  {t(`classSources.${kind}`)}
                </label>
              </div>
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
              <Field
                label={t("relativeBirthDate")}
                name="intake.relativeBirthDate"
                type="date"
                hint={t("relativeBirthDateHint")}
                defaultValue={source?.relativeBirthDate}
                invalid={hasError(errors, "classSource.relativeBirthDate")}
              />
            </div>
          </fieldset>
        ) : null}

        <Button type="submit" size="lg" className="w-full sm:w-auto">
          {t("continue")}
        </Button>
      </form>
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
    <form action={saveDrivingStep} className="space-y-6">
      <Hidden detail={detail} base={base} />
      <fieldset className="space-y-3 rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
        <legend className="px-1 text-lg font-semibold">{t("drivingTitle")}</legend>
        {(options.lists.drivingFormula ?? []).map((f) => (
          <div key={f.code} className="flex items-start gap-2">
            <input
              id={`formula-${f.code}`}
              type="radio"
              name="intake.drivingFormula"
              value={f.code}
              defaultChecked={chosen === f.code}
              required
              className="mt-1 h-4 w-4 accent-orange-500"
              aria-describedby={`formula-${f.code}-text`}
            />
            <div>
              <label htmlFor={`formula-${f.code}`} className="text-sm font-semibold">
                {f.label}
              </label>
              <p id={`formula-${f.code}-text`} className="text-sm text-warm-600">
                {t(`driving.${f.code}`, { age: options.expertMinAge })}
              </p>
            </div>
          </div>
        ))}
        {hasError(errors, "drivingFormula") ? (
          <p role="alert" className="text-sm text-red-700">
            {t("drivingRequired")}
          </p>
        ) : null}
      </fieldset>
      <Button type="submit" size="lg" className="w-full sm:w-auto">
        {t("continue")}
      </Button>
    </form>
  );
}

/** Screen 5: what will be sent, one tick for the consents, «Invia». */
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
  const consent = (
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
      <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-warm-200 bg-white p-4 text-sm sm:grid-cols-[12rem_1fr] sm:p-6">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-warm-600">{label}</dt>
            <dd className="font-medium">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <section className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold">{consent.text.title}</h2>
        <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-night-900">
          {consent.text.contentMd}
        </div>
        <div className="mt-4">
          <CheckField label={t("consentTick")} name="consent" required />
        </div>
      </section>
      <p className="text-sm text-warm-600">{t("afterSubmit")}</p>
      <Button type="submit" size="lg" className="w-full sm:w-auto">
        {t("submit")}
      </Button>
    </form>
  );
}

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary, StepNav } from "@/components/form";
import { requireViewer } from "@/lib/me";
import { requestDetail, requestOptions, type WizardStep } from "@/lib/requests";
import { ConfirmStep, DrivingStep, IntakeDataStep, VehicleTypeStep } from "./intake-steps";
import { CoverageStep } from "./terms-steps";

/** One page of the request wizard, for the private user or the broker. */
export async function WizardPage({
  base,
  steps,
  params,
  searchParams,
}: {
  base: "/preventivi" | "/richieste";
  steps: readonly WizardStep[];
  params: Promise<{ id: string; step: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireViewer();
  const { id, step: rawStep } = await params;
  const query = await searchParams;
  if (!(steps as readonly string[]).includes(rawStep)) notFound();
  const step = rawStep as WizardStep;
  const [detail, options] = await Promise.all([requestDetail(id), requestOptions()]);
  if (!detail.editable) redirect(`${base}/${id}`);
  const t = await getTranslations("wizard");
  const errors = typeof query.errore === "string" ? query.errore : undefined;

  let body;
  // Dan, 2026-10-21 (ADR 0013, docs/piano-broker.md B): the five screens, for both.
  const intakeStatus =
    query.stato === "NEW" || query.stato === "INSURED"
      ? query.stato
      : (((detail.draft?.intake ?? {}) as { vehicleStatus?: "INSURED" | "NEW" }).vehicleStatus ??
        "INSURED");
  if (step === "tipo") {
    body = <VehicleTypeStep detail={detail} base={base} />;
  } else if (step === "dati") {
    body = (
      <IntakeDataStep
        detail={detail}
        base={base}
        errors={errors}
        status={intakeStatus}
        unreadable={typeof query.illeggibile === "string" ? query.illeggibile : undefined}
      />
    );
  } else if (step === "guida") {
    body = <DrivingStep detail={detail} options={options} base={base} errors={errors} />;
  } else if (step === "conferma") {
    body = <ConfirmStep detail={detail} options={options} base={base} />;
  } else {
    body = <CoverageStep detail={detail} options={options} base={base} errors={errors} />;
  }

  return (
    <AppShell viewer={viewer}>
      <p className="text-sm text-warm-600">
        <Link href={`${base}/${id}`} className="underline">
          {t("backToRequest", { code: detail.code })}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">{t(`titles.${step}`)}</h1>
      <div className="mt-4">
        <StepNav steps={steps} current={step} base={base} id={id} />
      </div>
      {detail.integration ? (
        <div
          role="status"
          className="mb-6 rounded-xl border border-orange-500 bg-orange-50 p-4 text-sm"
        >
          <p className="font-semibold">{t("integration.title")}</p>
          <p className="mt-1">{detail.lastDecision?.message ?? ""}</p>
          <p className="mt-1">
            {t("integration.scope", {
              sections:
                detail.integration.sections.map((s) => t(`sections.${s}`)).join(", ") ||
                t("integration.none"),
              documents:
                detail.integration.documents.map((d) => t(`documentKinds.${d}`)).join(", ") ||
                t("integration.none"),
            })}
          </p>
        </div>
      ) : null}
      <ErrorSummary codes={errors} />
      {body}
    </AppShell>
  );
}

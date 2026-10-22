import { Icon } from "@astax/ui";
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

  const summary = (detail.draft?.intake ?? {}) as {
    vehicleStatus?: "INSURED" | "NEW";
    plate?: string;
  };
  return (
    <AppShell viewer={viewer}>
      <p className="text-table text-warm-600">
        <Link href={`${base}/${id}`} className="inline-flex min-h-11 items-center gap-1 underline">
          <Icon name="arrowLeft" size={16} />
          {t("backToRequest", { code: detail.code })}
        </Link>
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-x-8 lg:gap-y-2">
        <div className="lg:order-1 lg:col-span-2">
          <StepNav steps={steps} current={step} base={base} id={id} />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:order-2">
          <h1 className="font-display text-screen font-extrabold">{t(`titles.${step}`)}</h1>
          {detail.integration ? (
            <div
              role="status"
              className="flex flex-col gap-1 rounded-2xl bg-warning-50 p-4 text-table shadow-[inset_0_0_0_1px_var(--color-warning-700)]"
            >
              <p className="flex items-center gap-2 font-bold text-warning-700">
                <Icon name="warning" />
                {t("integration.title")}
              </p>
              {detail.lastDecision?.message ? (
                <p className="text-night-900">«{detail.lastDecision.message}»</p>
              ) : null}
              <p className="text-night-900">
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
        </div>
        <aside
          aria-labelledby="wizard-summary"
          className="hidden h-fit flex-col gap-3 rounded-2xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)] lg:order-3 lg:flex"
        >
          <h2 id="wizard-summary" className="text-label font-semibold text-warm-600">
            {t("aside.title")}
          </h2>
          <dl className="grid gap-2 text-table">
            <dt className="text-warm-600">{t("aside.vehicle")}</dt>
            <dd className="font-semibold">
              {[
                summary.vehicleStatus ? t(`intake.status.${summary.vehicleStatus}.label`) : null,
                summary.plate,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
            <dt className="text-warm-600">{t("aside.auction")}</dt>
            <dd className="font-semibold">
              {t("aside.auctionValue", { hours: options.defaultAuctionDurationHours })}
            </dd>
            {base === "/preventivi" ? (
              <>
                <dt className="text-warm-600">{t("aside.cost")}</dt>
                <dd className="font-semibold">{t("aside.costValue")}</dd>
              </>
            ) : null}
          </dl>
        </aside>
      </div>
    </AppShell>
  );
}

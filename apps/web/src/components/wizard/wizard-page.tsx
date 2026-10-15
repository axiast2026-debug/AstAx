import { SystemClock } from "@astax/adapters/clock";
import { romeCalendarDate } from "@astax/shared/format";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readPlateHint } from "@/app/request-actions";
import { AppShell } from "@/components/app-shell";
import { ErrorSummary, StepNav } from "@/components/form";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import {
  claimYears,
  extracted,
  latestDocument,
  requestDetail,
  requestOptions,
  type WizardStep,
} from "@/lib/requests";
import { BrokerConsentStep, PrivateConsentStep } from "./consent-steps";
import { DriversStep } from "./drivers-step";
import { SummaryStep } from "./summary-step";
import { AuctionStep, CoverageStep } from "./terms-steps";
import { VehicleStep } from "./vehicle-step";

interface Municipality {
  istatCode: string;
  name: string;
  province: string;
}

const clock = new SystemClock();

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
  if (step === "veicolo") {
    body = (
      <VehicleStep
        detail={detail}
        options={options}
        base={base}
        errors={errors}
        hint={await readPlateHint(id)}
        claimYears={claimYears(detail.draft?.request?.startDate, romeCalendarDate(clock.now()))}
      />
    );
  } else if (step === "conducenti") {
    const draft = detail.draft ?? {};
    const codes = new Set<string>();
    const add = (code: string | undefined) => code && codes.add(code);
    if (draft.policyHolder?.kind === "PERSON") add(draft.policyHolder.residence.municipalityIstat);
    if (draft.policyHolder?.kind === "COMPANY")
      add(draft.policyHolder.registeredOffice.municipalityIstat);
    if (
      draft.vehicleOwner &&
      draft.vehicleOwner !== "SAME_AS_POLICY_HOLDER" &&
      draft.vehicleOwner.kind === "PERSON"
    ) {
      add(draft.vehicleOwner.residence.municipalityIstat);
    }
    for (const d of draft.driving?.drivers ?? []) add(d.person.residence.municipalityIstat);
    add(extracted(latestDocument(detail, "REGISTRATION_CERTIFICATE"), "ownerMunicipalityIstat"));
    const names = new Map<string, Municipality>();
    for (const code of codes) {
      const found = (await api<Municipality[]>(`/reference/municipalities?q=${code}`)).body[0];
      if (found) names.set(code, found);
    }
    body = (
      <DriversStep
        detail={detail}
        options={options}
        base={base}
        errors={errors}
        municipalityNames={names}
        allowCompany={base === "/richieste"}
      />
    );
  } else if (step === "copertura") {
    body = <CoverageStep detail={detail} options={options} base={base} errors={errors} />;
  } else if (step === "asta") {
    body = <AuctionStep detail={detail} options={options} base={base} />;
  } else if (step === "consensi") {
    body = <PrivateConsentStep detail={detail} codeSent={query.codice === "inviato"} />;
  } else if (step === "consenso") {
    body = <BrokerConsentStep detail={detail} linkSent={query.link === "inviato"} />;
  } else {
    body = <SummaryStep detail={detail} options={options} base={base} steps={steps} />;
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

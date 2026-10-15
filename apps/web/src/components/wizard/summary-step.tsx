import { formatDate } from "@astax/shared/format";
import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { submitRequest } from "@/app/request-actions";
import type { RequestDetail, RequestOptions, WizardStep } from "@/lib/requests";
import { STEP_SECTIONS } from "@/lib/requests";
import { holderName } from "./drivers-step";

/**
 * Step 6: summary and submission. The auction opens after the verification
 * by AstAx; its duration in working hours starts then (phase 3 computes the
 * closing time with the calendar).
 */
export async function SummaryStep({
  detail,
  options,
  base,
  steps,
}: {
  detail: RequestDetail;
  options: RequestOptions;
  base: string;
  steps: readonly WizardStep[];
}) {
  const t = await getTranslations("wizard.summary");
  const ts = await getTranslations("wizard.steps");
  const draft = detail.draft ?? {};
  const label = (list: string, code: string | undefined) =>
    options.lists[list]?.find((o) => o.code === code)?.label ?? code ?? "";
  const pkg = options.packages.find((p) => p.code === draft.request?.packageCode);
  const missingSteps = steps.filter((step) =>
    STEP_SECTIONS[step].some((s) => detail.missingSections.includes(s)),
  );
  const blocked = (draft.specialUses ?? []).length > 0;

  const rows: [string, string][] = [
    [
      t("vehicle"),
      draft.vehicle ? `${draft.vehicle.make} ${draft.vehicle.model} · ${draft.vehicle.plate}` : "",
    ],
    [t("holder"), holderName(draft.policyHolder)],
    [t("drivers"), (draft.driving?.drivers ?? []).map((d) => holderName(d.person)).join(", ")],
    [t("formula"), label("drivingFormula", draft.driving?.drivingFormula)],
    [t("provenance"), label("provenance", draft.history?.provenance)],
    [t("package"), pkg?.name ?? ""],
    [t("startDate"), draft.request ? formatDate(`${draft.request.startDate}T12:00:00Z`) : ""],
    [t("duration"), draft.request ? t("hours", { hours: draft.request.auctionDurationHours }) : ""],
    [t("validity"), draft.request ? t("days", { days: draft.request.minValidityDays }) : ""],
    [t("consent"), detail.consent ? t("consentGiven") : t("consentMissing")],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-warm-200 bg-white p-4 text-sm sm:grid-cols-[12rem_1fr] sm:p-6">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-warm-600">{term}</dt>
            <dd className="font-medium">{value || t("missing")}</dd>
          </div>
        ))}
      </dl>
      {missingSteps.length > 0 ? (
        <div role="status" className="rounded-xl bg-warm-100 p-4 text-sm">
          <p>{t("incomplete")}</p>
          <ul className="mt-2 list-disc pl-5">
            {missingSteps.map((step) => (
              <li key={step}>
                <Link href={`${base}/${detail.id}/${step}`} className="underline">
                  {ts(step)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {blocked ? (
        <p role="alert" className="rounded-xl border border-red-600 bg-red-50 p-4 text-sm">
          {t("excluded")}
        </p>
      ) : null}
      <p className="text-sm text-warm-600">{t("afterSubmit")}</p>
      <form action={submitRequest}>
        <input type="hidden" name="requestId" value={detail.id} />
        <input type="hidden" name="base" value={base} />
        <Button type="submit" size="lg">
          {t("submit")}
        </Button>
      </form>
    </div>
  );
}

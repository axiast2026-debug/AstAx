import { RECOURSE_WAIVER_CASES } from "@astax/shared/domain";
import { formatDate } from "@astax/shared/format";
import { Button } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { sendOffer } from "@/app/agency-actions";
import { CheckField, Field, Fieldset, hasError } from "@/components/form";
import {
  centsToEuroInput,
  COVERAGE_ITEMS,
  type AgencyRequestDetail,
  type OwnOffer,
  type Requirement,
} from "@/lib/agency";

type Declared = Record<string, unknown> | undefined;
const num = (d: Declared, key: string) => (typeof d?.[key] === "number" ? String(d[key]) : "");

/** What the package asks for an item, in words (OFF-06: same or better, never less). */
async function requirementText(item: string, r: Requirement | undefined): Promise<string> {
  const t = await getTranslations("agency.offer.requirement");
  if (!r) return t("none");
  if (item === "rca") {
    return r.limitType === "SINGLE_LIMIT"
      ? t("rcaSingle", { eur: Number(r.minSingleLimitEur) })
      : t("rcaLegal");
  }
  if (!r.required) return t("none");
  switch (item) {
    case "driverAccident":
      return t("capital", { eur: Number(r.minCapitalEur) });
    case "theftFire":
    case "naturalEventsVandalism":
      return t("coinsurance", {
        pct: Number(r.maxCoinsurancePct),
        eur: Number(r.maxCoinsuranceMinEur),
      });
    case "glass":
      return t("deductible", { eur: Number(r.maxDeductibleEur) });
    case "recourseWaiver":
      return t("cases", { count: Array.isArray(r.minCases) ? r.minCases.length : 0 });
    default:
      return t("required");
  }
}

/**
 * The offer (OFF-04): premium, company and product among the agency's
 * mandates, the coverage item by item against the package, the guarantee
 * date, the PDF of the quote and the confirmation that the offer is binding.
 * A change (OFF-07) starts from the agency's own copy.
 */
export async function OfferForm({
  detail,
  own,
  errors,
}: {
  detail: AgencyRequestDetail;
  own: OwnOffer | null;
  errors: string | undefined;
}) {
  const t = await getTranslations("agency.offer");
  const tc = await getTranslations("agency.coverage");
  // GAR-07, proposal C: a reconfirmation starts from the agency's offer of the last round.
  const previous = own ? null : detail.previousOffer;
  const base = own?.offer ?? previous;
  const hasPdf = own?.hasPdf ?? previous?.hasPdf ?? false;
  const coverage = base?.coverage ?? {};
  const requirements = detail.package?.requirements ?? {};
  const isIncluded = (item: string) =>
    base ? coverage[item]?.included === true : requirements[item]?.required === true;
  const rca = coverage.rca;
  const separate = rca?.limitType === "SEPARATE_LIMITS";
  const requirementTexts = await Promise.all(
    COVERAGE_ITEMS.map((item) => requirementText(item, requirements[item])),
  );

  return (
    <form action={sendOffer} encType="multipart/form-data" className="space-y-6">
      <input type="hidden" name="auctionId" value={detail.auctionId} />
      {own ? <input type="hidden" name="offerId" value={own.id} /> : null}
      <Fieldset legend={t("priceTitle")}>
        <Field
          label={t("premium")}
          name="premium"
          inputMode="decimal"
          required
          hint={t("premiumHint")}
          defaultValue={base ? centsToEuroInput(base.annualGrossPremiumCents) : ""}
          invalid={hasError(errors, "annualGrossPremiumCents")}
        />
        <div>
          <label htmlFor="f-companyId" className="block text-sm font-medium">
            {t("company")}
          </label>
          <select
            id="f-companyId"
            name="companyId"
            required
            defaultValue={base?.companyId ?? ""}
            className="mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2"
            aria-invalid={hasError(errors, "companyId") || undefined}
          >
            <option value="">{t("choose")}</option>
            {detail.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-productId" className="block text-sm font-medium">
            {t("product")}
          </label>
          <select
            id="f-productId"
            name="productId"
            required
            defaultValue={base?.productId ?? ""}
            className="mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2"
            aria-invalid={hasError(errors, "productId") || undefined}
          >
            <option value="">{t("choose")}</option>
            {detail.companies.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {detail.products
                  .filter((p) => p.companyId === c.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-xs text-warm-600">{t("productHint")}</p>
        </div>
        <Field
          label={t("guaranteeUntil")}
          name="guaranteeUntil"
          type="date"
          required
          min={detail.minGuaranteeDate}
          hint={t("guaranteeHint", { date: formatDate(detail.minGuaranteeDate) })}
          defaultValue={own?.offer.guaranteeUntil ?? detail.minGuaranteeDate}
          invalid={hasError(errors, "guaranteeUntil")}
        />
      </Fieldset>

      <fieldset className="rounded-xl border border-warm-200 bg-white p-4 sm:p-6">
        <legend className="px-1 text-base font-semibold">{t("coverageTitle")}</legend>
        <p className="text-sm text-warm-600">
          {t("coverageIntro", { name: detail.package?.name ?? "—" })}
        </p>
        <div className="mt-4 space-y-4">
          {COVERAGE_ITEMS.map((item, index) => {
            const d = coverage[item];
            return (
              <div key={item} className="rounded-lg border border-warm-200 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{tc(item)}</p>
                  <p className="text-xs text-warm-600">
                    {t("packageAsks", { text: requirementTexts[index] ?? "" })}
                  </p>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {item === "rca" ? (
                    <>
                      <div>
                        <label htmlFor="f-coverage-rca-limitType" className="block text-sm">
                          {t("limitType")}
                        </label>
                        <select
                          id="f-coverage-rca-limitType"
                          name="coverage.rca.limitType"
                          defaultValue={separate ? "SEPARATE_LIMITS" : "SINGLE_LIMIT"}
                          className="mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2"
                        >
                          <option value="SINGLE_LIMIT">{t("singleLimit")}</option>
                          <option value="SEPARATE_LIMITS">{t("separateLimits")}</option>
                        </select>
                      </div>
                      <Field
                        label={t("singleLimitEur")}
                        name="coverage.rca.singleLimitEur"
                        inputMode="numeric"
                        defaultValue={num(rca, "singleLimitEur")}
                      />
                      <Field
                        label={t("bodilyInjuryEur")}
                        name="coverage.rca.bodilyInjuryPerClaimEur"
                        inputMode="numeric"
                        defaultValue={num(rca, "bodilyInjuryPerClaimEur")}
                      />
                      <Field
                        label={t("propertyDamageEur")}
                        name="coverage.rca.propertyDamagePerClaimEur"
                        inputMode="numeric"
                        defaultValue={num(rca, "propertyDamagePerClaimEur")}
                      />
                    </>
                  ) : (
                    <>
                      <CheckField
                        label={t("included")}
                        name={`coverage.${item}.included`}
                        defaultChecked={isIncluded(item)}
                      />
                      {item === "recourseWaiver"
                        ? RECOURSE_WAIVER_CASES.map((c) => (
                            <CheckField
                              key={c}
                              label={t(`cases.${c}`)}
                              name="coverage.recourseWaiver.cases"
                              value={c}
                              defaultChecked={
                                base
                                  ? Array.isArray(d?.cases) && d.cases.includes(c)
                                  : Array.isArray(requirements.recourseWaiver?.minCases) &&
                                    requirements.recourseWaiver.minCases.includes(c)
                              }
                            />
                          ))
                        : null}
                      {item === "driverAccident" ? (
                        <Field
                          label={t("capitalEur")}
                          name="coverage.driverAccident.capitalEur"
                          inputMode="numeric"
                          defaultValue={num(d, "capitalEur")}
                        />
                      ) : null}
                      {item === "theftFire" || item === "naturalEventsVandalism" ? (
                        <>
                          <Field
                            label={t("coinsurancePct")}
                            name={`coverage.${item}.coinsurancePct`}
                            inputMode="numeric"
                            defaultValue={num(d, "coinsurancePct")}
                          />
                          <Field
                            label={t("coinsuranceMinEur")}
                            name={`coverage.${item}.coinsuranceMinEur`}
                            inputMode="numeric"
                            defaultValue={num(d, "coinsuranceMinEur")}
                          />
                        </>
                      ) : null}
                      {item === "theftFire" ? (
                        <CheckField
                          label={t("marketValue")}
                          name="coverage.theftFire.marketValue"
                          defaultChecked={d?.marketValue === true}
                        />
                      ) : null}
                      {item === "glass" ? (
                        <Field
                          label={t("deductibleEur")}
                          name="coverage.glass.deductibleEur"
                          inputMode="numeric"
                          defaultValue={num(d, "deductibleEur")}
                        />
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <Fieldset legend={t("documentTitle")}>
        <Field
          label={hasPdf ? t("pdfReplace") : t("pdf")}
          name="pdf"
          type="file"
          accept="application/pdf"
          required={!hasPdf}
          hint={previous?.hasPdf ? t("pdfKept") : undefined}
          invalid={hasError(errors, "pdf")}
        />
        <div className="sm:col-span-2">
          <label htmlFor="f-notes" className="block text-sm font-medium">
            {t("notes")}
          </label>
          <textarea
            id="f-notes"
            name="notes"
            rows={3}
            defaultValue={base?.notes ?? ""}
            aria-describedby="f-notes-hint"
            aria-invalid={hasError(errors, "notes") || undefined}
            className="mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2"
          />
          <p id="f-notes-hint" className="mt-1 text-xs text-warm-600">
            {t("notesHint")}
          </p>
        </div>
      </Fieldset>

      <CheckField label={t("binding")} name="binding" required />
      {previous ? (
        <div className="flex flex-wrap gap-3">
          <input
            type="hidden"
            name="previousPremium"
            value={centsToEuroInput(previous.annualGrossPremiumCents)}
          />
          <Button type="submit" name="mode" value="confirm">
            {t("confirmSame")}
          </Button>
          <Button type="submit" name="mode" value="update" variant="outline">
            {t("sendUpdated")}
          </Button>
        </div>
      ) : (
        <Button type="submit">{own ? t("change") : t("send")}</Button>
      )}
    </form>
  );
}

import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import type { InputHTMLAttributes } from "react";
import { completeRequest } from "@/app/verifiche/actions";
import type { Completion } from "@/lib/verification";

/**
 * ADR 0013 (Dan, 2026-10-21): the back office completes a request that has
 * the essential data only. The fields come prefilled with what the bot read;
 * the missing ones are marked; the customer's number is there for the call
 * (answer 6B). Saving makes version 1 of the data, then the approval opens.
 */
export async function CompletionForm({
  requestId,
  completion,
}: {
  requestId: string;
  completion: Completion;
}) {
  const t = await getTranslations("verification.completion");
  const { candidate, intake, lists, phone } = completion;
  const missing = new Set(candidate.missing);
  const holder = candidate.policyHolder as Record<string, string | undefined>;
  const licence = (candidate.drivers[0]?.licence ?? {}) as Record<string, string | undefined>;
  const vehicle = candidate.vehicle as Record<string, string | number | boolean | undefined>;
  const history = candidate.history as Record<string, unknown>;
  const label = (item: { it: string }) => item.it;

  const field = (
    name: string,
    path: string,
    value: unknown,
    props: InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block text-sm">
      <span className={missing.has(path) ? "font-semibold text-red-700" : "text-warm-600"}>
        {t(`fields.${name}`)}
        {missing.has(path) ? ` · ${t("missing")}` : ""}
      </span>
      <input
        name={name}
        defaultValue={value === undefined || value === null ? "" : String(value)}
        className={`mt-1 block w-full rounded-md border px-2 py-1.5 ${
          missing.has(path) ? "border-red-600 bg-red-50" : "border-warm-200"
        }`}
        {...props}
      />
    </label>
  );
  const select = (name: string, path: string, value: unknown, list: string) => (
    <label className="block text-sm">
      <span className={missing.has(path) ? "font-semibold text-red-700" : "text-warm-600"}>
        {t(`fields.${name}`)}
        {missing.has(path) ? ` · ${t("missing")}` : ""}
      </span>
      <select
        name={name}
        defaultValue={typeof value === "string" ? value : ""}
        required
        className={`mt-1 block w-full rounded-md border px-2 py-1.5 ${
          missing.has(path) ? "border-red-600 bg-red-50" : "border-warm-200"
        }`}
      >
        <option value="" />
        {(lists[list] ?? []).map((item) => (
          <option key={item.code} value={item.code}>
            {label(item)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Card id="completa">
      <CardTitle>{t("title")}</CardTitle>
      <p className="mt-1 text-sm text-warm-600">{t("intro")}</p>
      {phone ? (
        <p className="mt-3 text-sm">
          {t("call")}{" "}
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-semibold underline">
            {phone}
          </a>
        </p>
      ) : null}
      <p className="mt-2 text-sm">
        {t("essential", {
          plate: intake.plate,
          status: t(`status.${intake.vehicleStatus}`),
          source: intake.classSource
            ? `${t(`classSources.${intake.classSource.kind}`)}${intake.classSource.plate ? ` (${intake.classSource.plate})` : ""}`
            : "—",
        })}
      </p>
      <form action={completeRequest} className="mt-4 space-y-5">
        <input type="hidden" name="requestId" value={requestId} />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-base font-semibold">{t("holder")}</legend>
          {field("surname", "policyHolder.surname", holder.surname, { required: true })}
          {field("givenName", "policyHolder.givenName", holder.givenName, { required: true })}
          {field("fiscalCode", "policyHolder.fiscalCode", holder.fiscalCode, { required: true })}
          {field("birthDate", "policyHolder.birthDate", holder.birthDate, {
            type: "date",
            required: true,
          })}
          {field("birthPlace", "policyHolder.birthPlace", holder.birthPlace, { required: true })}
          {field("sex", "policyHolder.sex", holder.sex, { required: true, maxLength: 1 })}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-base font-semibold">{t("licence")}</legend>
          {select(
            "licenceCategory",
            "drivers.0.licence.category",
            licence.category,
            "licenceCategory",
          )}
          {field("licenceNumber", "drivers.0.licence.number", licence.number, { required: true })}
          {field("licenceIssuedOn", "drivers.0.licence.issuedOn", licence.issuedOn, {
            type: "date",
            required: true,
          })}
          {field("licenceExpiresOn", "drivers.0.licence.expiresOn", licence.expiresOn, {
            type: "date",
            required: true,
          })}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-base font-semibold">{t("vehicle")}</legend>
          {select("vehicleType", "vehicle.type", vehicle.type, "vehicleType")}
          {select("vehicleUse", "vehicle.use", vehicle.use, "vehicleUse")}
          {field("make", "vehicle.make", vehicle.make, { required: true })}
          {field("model", "vehicle.model", vehicle.model, { required: true })}
          {select("fuel", "vehicle.fuel", vehicle.fuel, "fuel")}
          {field("powerKw", "vehicle.powerKw", vehicle.powerKw, {
            type: "number",
            min: 1,
            required: true,
          })}
          {field(
            "firstRegistrationDate",
            "vehicle.firstRegistrationDate",
            vehicle.firstRegistrationDate,
            {
              type: "date",
              required: true,
            },
          )}
          {field("purchaseDate", "vehicle.purchaseDate", vehicle.purchaseDate, {
            type: "date",
            required: true,
          })}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-base font-semibold">{t("history")}</legend>
          {select("provenance", "history.provenance", history.provenance, "provenance")}
          {field("cuClass", "history.cuClass", history.cuClass, {
            type: "number",
            min: 1,
            max: 18,
          })}
          {field("claimsMain", "history.claims", 0, { type: "number", min: 0, required: true })}
          {field("claimsShared", "history.claims", 0, { type: "number", min: 0, required: true })}
          {field("currentInsurer", "history.currentInsurer", history.currentInsurer)}
          {field("currentExpiryDate", "history.currentExpiryDate", history.currentExpiryDate, {
            type: "date",
          })}
          {field("riskUniqueId", "history.riskUniqueId", history.riskUniqueId)}
          {intake.classSource?.kind === "FAMILY"
            ? field("relativeFiscalCode", "history.familyRc", "", { required: true })
            : null}
        </fieldset>
        <Button type="submit">{t("save")}</Button>
      </form>
    </Card>
  );
}

import { Button, buttonVariants, Card, CardTitle, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import type { InputHTMLAttributes } from "react";
import { completeRequest } from "@/app/verifiche/actions";
import type { AniaSheet } from "@astax/shared/domain";
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
  ania = null,
}: {
  requestId: string;
  completion: Completion;
  /** Dan, 2026-10-28: what ANIA said fills what the documents did not. */
  ania?: AniaSheet | null;
}) {
  const t = await getTranslations("verification.completion");
  const { candidate, intake, lists, phone } = completion;
  const missing = new Set(candidate.missing);
  const read = candidate.policyHolder as Record<string, string | undefined>;
  const holder: Record<string, string | undefined> = {
    ...read,
    surname: read.surname ?? ania?.surname ?? undefined,
    givenName: read.givenName ?? ania?.givenName ?? undefined,
    fiscalCode: read.fiscalCode ?? ania?.ownerFiscalCode ?? undefined,
    birthDate: read.birthDate ?? ania?.birthDate ?? undefined,
    sex: read.sex ?? ania?.sex ?? undefined,
  };
  const licence = (candidate.drivers[0]?.licence ?? {}) as Record<string, string | undefined>;
  const readVehicle = candidate.vehicle as Record<string, string | number | boolean | undefined>;
  const vehicle: Record<string, string | number | boolean | undefined> = {
    ...readVehicle,
    firstRegistrationDate:
      readVehicle.firstRegistrationDate ?? ania?.firstRegistrationDate ?? undefined,
    purchaseDate: readVehicle.purchaseDate ?? ania?.purchaseDate ?? undefined,
  };
  const readHistory = candidate.history as Record<string, unknown>;
  const aniaClass = Number(ania?.cuClass);
  const history: Record<string, unknown> = {
    ...readHistory,
    cuClass: readHistory.cuClass ?? (Number.isInteger(aniaClass) ? aniaClass : undefined),
    currentInsurer: readHistory.currentInsurer ?? ania?.currentInsurer?.name ?? undefined,
    currentExpiryDate: readHistory.currentExpiryDate ?? ania?.coverExpiry ?? undefined,
  };
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
        className={`mt-1 block min-h-11 w-full rounded-md border px-2 py-1.5 ${
          missing.has(path) ? "border-red-600 bg-red-50" : "border-warm-600"
        }`}
        {...props}
      />
    </label>
  );
  const select = (name: string, path: string, value: unknown, list: string, required = true) => (
    <label className="block text-sm">
      <span className={missing.has(path) ? "font-semibold text-red-700" : "text-warm-600"}>
        {t(`fields.${name}`)}
        {missing.has(path) ? ` · ${t("missing")}` : ""}
      </span>
      <select
        name={name}
        defaultValue={typeof value === "string" ? value : ""}
        required={required}
        className={`mt-1 block min-h-11 w-full rounded-md border px-2 py-1.5 ${
          missing.has(path) ? "border-red-600 bg-red-50" : "border-warm-600"
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
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-warm-100 p-3">
          <span className="text-table">{t("call")}</span>
          {/* Back office of the design: the call is a button; on a phone it dials. */}
          <a
            href={`tel:${phone.replace(/\s/g, "")}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Icon name="phone" size={16} />
            {t("callButton", { phone })}
          </a>
        </div>
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
            false,
          )}
          {/* Dan, 2026-10-28: optional, all four or none (question 38). */}
          {field("licenceNumber", "drivers.0.licence.number", licence.number)}
          {field("licenceIssuedOn", "drivers.0.licence.issuedOn", licence.issuedOn, {
            type: "date",
          })}
          {field("licenceExpiresOn", "drivers.0.licence.expiresOn", licence.expiresOn, {
            type: "date",
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
          {field("claimsMain", "history.claims", ania?.mainClaims ?? 0, {
            type: "number",
            min: 0,
            required: true,
          })}
          {field("claimsShared", "history.claims", ania?.sharedClaims ?? 0, {
            type: "number",
            min: 0,
            required: true,
          })}
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

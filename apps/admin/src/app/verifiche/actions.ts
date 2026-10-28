"use server";

import { parseItalianDate, type AniaSheet, type QuoteData } from "@astax/shared/domain";
import type { Completion } from "@/lib/verification";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

/** The licence fields of the completion: all of them, or none (question 38). */
const LICENCE_FIELDS = [
  "licenceCategory",
  "licenceNumber",
  "licenceIssuedOn",
  "licenceExpiresOn",
] as const;

/**
 * Back office actions on a request under verification (spec 06). Errors come
 * back as codes in the `errore` parameter, never as values.
 */
function idOf(formData: FormData): string {
  const id = String(formData.get("requestId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/verifiche");
  return id;
}

const value = (formData: FormData, name: string): string | undefined => {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { path: string; issue: string }[] };
  return problem.errors?.length
    ? problem.errors.map((e) => e.issue).join(",")
    : (problem.code ?? "INTERNAL");
}

async function post(id: string, path: string, payload: unknown, okStatus = 200): Promise<void> {
  const { status, body } = await api(`/verification/requests/${id}/${path}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (status !== okStatus) redirect(`/verifiche/${id}?errore=${encodeURIComponent(codesOf(body))}`);
}

export async function assignToMe(formData: FormData): Promise<void> {
  const id = idOf(formData);
  await post(id, "assign", {});
  revalidatePath(`/verifiche/${id}`);
  redirect(`/verifiche/${id}`);
}

export async function saveChecklistItem(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const code = String(formData.get("code") ?? "");
  const { status, body } = await api(
    `/verification/requests/${id}/checklist/${encodeURIComponent(code)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        correction: value(formData, "correction") ?? "",
        note: value(formData, "note") ?? "",
      }),
    },
  );
  if (status !== 200) redirect(`/verifiche/${id}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/verifiche/${id}#voce-${code}`);
}

export async function approve(formData: FormData): Promise<void> {
  const id = idOf(formData);
  await post(id, "approve", value(formData, "note") ? { note: value(formData, "note") } : {});
  redirect(`/verifiche?fatto=approvata`);
}

export async function requestIntegration(formData: FormData): Promise<void> {
  const id = idOf(formData);
  await post(id, "integration", {
    reasonCodes: formData.getAll("reasonCodes").map(String),
    sections: formData.getAll("sections").map(String),
    documents: formData.getAll("documents").map(String),
    ...(value(formData, "message") ? { message: value(formData, "message") } : {}),
  });
  redirect(`/verifiche?fatto=integrazione`);
}

export async function exclude(formData: FormData): Promise<void> {
  const id = idOf(formData);
  await post(id, "exclude", {
    reasonCode: value(formData, "reasonCode"),
    ...(value(formData, "message") ? { message: value(formData, "message") } : {}),
  });
  redirect(`/verifiche?fatto=esclusa`);
}

/** A correction of a few fields: the API stores a new version with the changed paths. */
export async function correct(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const { body: card } = await api<{ quoteData: QuoteData | null }>(`/verification/requests/${id}`);
  if (!card.quoteData) redirect(`/verifiche/${id}?errore=CONFLICT`);
  const data = card.quoteData;
  const number = (name: string) => {
    const v = value(formData, name);
    return v === undefined ? undefined : Number(v);
  };
  const corrected: QuoteData = {
    ...data,
    vehicle: {
      ...data.vehicle,
      make: value(formData, "vehicle.make") ?? data.vehicle.make,
      model: value(formData, "vehicle.model") ?? data.vehicle.model,
      ...(value(formData, "vehicle.version")
        ? { version: value(formData, "vehicle.version") }
        : {}),
      powerKw: number("vehicle.powerKw") ?? data.vehicle.powerKw,
      firstRegistrationDate:
        value(formData, "vehicle.firstRegistrationDate") ?? data.vehicle.firstRegistrationDate,
    },
    history: {
      ...data.history,
      ...(number("history.cuClass") === undefined ? {} : { cuClass: number("history.cuClass") }),
      ...(value(formData, "history.currentInsurer")
        ? { currentInsurer: value(formData, "history.currentInsurer") }
        : {}),
      ...(value(formData, "history.currentExpiryDate")
        ? { currentExpiryDate: value(formData, "history.currentExpiryDate") }
        : {}),
    },
  };
  await post(id, "corrections", { quoteData: corrected, reason: value(formData, "reason") ?? "" });
  redirect(`/verifiche/${id}?fatto=corretta`);
}

function organizationOf(formData: FormData, id: string): string {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) redirect(`/verifiche/${id}`);
  return organizationId;
}

/** ASTA-06: leaves an agency out of the auction of this request, with the reason. */
export async function excludeAgency(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const organizationId = organizationOf(formData, id);
  await post(id, `agencies/${organizationId}/exclude`, { reason: value(formData, "reason") ?? "" });
  revalidatePath(`/verifiche/${id}`);
  redirect(`/verifiche/${id}#agenzie`);
}

export async function includeAgency(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const organizationId = organizationOf(formData, id);
  await post(id, `agencies/${organizationId}/include`, {});
  revalidatePath(`/verifiche/${id}`);
  redirect(`/verifiche/${id}#agenzie`);
}

/**
 * ADR 0013 (Dan, 2026-10-21): the back office completes a request with the
 * essential data only. The essential data (residence, driving, other plate)
 * and the coverages come from the card; the rest from the form, prefilled
 * with what the bot read. The API checks it like a submission.
 */
export async function completeRequest(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const { body: card } = await api<{
    completion: Completion | null;
    verification: { checks: { PLATE?: { value?: string } } } | null;
  }>(`/verification/requests/${id}`);
  const completion = card.completion;
  if (!completion) redirect(`/verifiche/${id}?errore=CONFLICT`);
  const { intake, candidate } = completion;
  const number = (name: string) => {
    const v = value(formData, name);
    return v === undefined ? undefined : Number(v);
  };
  const holder = {
    kind: "PERSON" as const,
    surname: value(formData, "surname") ?? "",
    givenName: value(formData, "givenName") ?? "",
    fiscalCode: value(formData, "fiscalCode") ?? "",
    birthDate: value(formData, "birthDate") ?? "",
    birthPlace: value(formData, "birthPlace") ?? "",
    sex: (value(formData, "sex")?.toUpperCase() === "F" ? "F" : "M") as "M" | "F",
    residence: intake.residence,
  };
  const startYear = Number(candidate.request.startDate.slice(0, 4));
  const claimsMain = number("claimsMain") ?? 0;
  const claimsShared = number("claimsShared") ?? 0;
  const quoteData: QuoteData = {
    schemaVersion: 1,
    policyHolder: holder,
    vehicleOwner: "SAME_AS_POLICY_HOLDER",
    drivers: [
      {
        person: holder,
        isMain: true,
        // Dan, 2026-10-28: the licence only when the operator has it (question 38).
        ...(LICENCE_FIELDS.some((f) => value(formData, f))
          ? {
              licence: {
                category: value(formData, "licenceCategory") ?? "",
                number: value(formData, "licenceNumber") ?? "",
                issuedOn: value(formData, "licenceIssuedOn") ?? "",
                expiresOn: value(formData, "licenceExpiresOn") ?? "",
              },
            }
          : {}),
      },
    ],
    drivingFormula: intake.drivingFormula ?? candidate.drivingFormula ?? "FREE",
    vehicle: {
      // Dan, 2026-10-28: the plate corrected from the registration certificate.
      plate: card.verification?.checks.PLATE?.value ?? intake.plate,
      type: value(formData, "vehicleType") ?? "",
      use: value(formData, "vehicleUse") ?? "",
      make: value(formData, "make") ?? "",
      model: value(formData, "model") ?? "",
      fuel: value(formData, "fuel") ?? "",
      powerKw: number("powerKw") ?? 0,
      firstRegistrationDate: value(formData, "firstRegistrationDate") ?? "",
      purchaseDate: value(formData, "purchaseDate") ?? "",
      isNew: false,
    },
    history: {
      provenance: value(formData, "provenance") ?? "",
      ...(number("cuClass") === undefined ? {} : { cuClass: number("cuClass") }),
      // The counts of the risk certificate, booked in the year of the start.
      claims:
        claimsMain + claimsShared > 0
          ? [
              {
                year: startYear,
                mainResponsibility: claimsMain,
                sharedResponsibility: claimsShared,
              },
            ]
          : [],
      ...(value(formData, "currentInsurer")
        ? { currentInsurer: value(formData, "currentInsurer") }
        : {}),
      ...(value(formData, "currentExpiryDate")
        ? { currentExpiryDate: value(formData, "currentExpiryDate") }
        : {}),
      ...(value(formData, "riskUniqueId") ? { riskUniqueId: value(formData, "riskUniqueId") } : {}),
      ...(intake.classSource?.kind === "FAMILY" && intake.classSource.plate
        ? {
            familyRc: {
              plate: intake.classSource.plate,
              relativeFiscalCode: value(formData, "relativeFiscalCode") ?? "",
            },
          }
        : {}),
    },
    request: candidate.request,
  };
  await post(id, "corrections", { quoteData, reason: "Completamento dai documenti (ADR 0013)" });
  redirect(`/verifiche/${id}?fatto=completata`);
}

/** Dan, 2026-10-28: gives the request back to the queue (its holder, or the supervisor). */
export async function release(formData: FormData): Promise<void> {
  const id = idOf(formData);
  await post(id, "release", {});
  revalidatePath(`/verifiche/${id}`);
  redirect(`/verifiche/${id}`);
}

async function put(id: string, step: string, payload: unknown): Promise<void> {
  const { status, body } = await api(`/verification/requests/${id}/checks/${step}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (status !== 200) redirect(`/verifiche/${id}?errore=${encodeURIComponent(codesOf(body))}`);
}

function stepOf(formData: FormData, id: string): string {
  const step = String(formData.get("step") ?? "");
  if (!/^(REGISTRATION|IDENTITY|PLATE|BIRTH_DATE|QUOTE_TYPE)$/.test(step)) {
    revalidatePath(`/verifiche/${id}`);
    redirect(`/verifiche/${id}`);
  }
  return step;
}

/** One of the five checks, confirmed as it is. */
export async function confirmCheck(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const step = stepOf(formData, id);
  if (step === "QUOTE_TYPE") {
    if (formData.get("feasible") !== "1") {
      redirect(`/verifiche/${id}?errore=NOT_FEASIBLE#verifiche`);
    }
    await put(id, step, { value: value(formData, "quoteType") ?? "" });
  } else {
    await put(id, step, {});
  }
  revalidatePath(`/verifiche/${id}`);
  redirect(`/verifiche/${id}#verifiche`);
}

export async function clearCheck(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const step = stepOf(formData, id);
  const { status, body } = await api(`/verification/requests/${id}/checks/${step}`, {
    method: "DELETE",
  });
  if (status !== 200) redirect(`/verifiche/${id}?errore=${encodeURIComponent(codesOf(body))}`);
  revalidatePath(`/verifiche/${id}`);
  redirect(`/verifiche/${id}#verifiche`);
}

/**
 * The plate or the birth date corrected from the documents: a new version of
 * the data when the request has it (as every correction), then the check
 * with the corrected value. A request still to complete keeps the value for
 * the completion.
 */
export async function correctCheck(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const step = stepOf(formData, id);
  const corrected = value(formData, "value");
  if (!corrected || (step !== "PLATE" && step !== "BIRTH_DATE")) {
    redirect(`/verifiche/${id}?errore=VALIDATION_FAILED#verifiche`);
  }
  const { body: card } = await api<{ quoteData: QuoteData | null }>(`/verification/requests/${id}`);
  const data = card.quoteData;
  if (data && step === "PLATE") {
    const plate = corrected.replace(/[\s-]/g, "").toUpperCase();
    if (plate !== data.vehicle.plate) {
      await post(id, "corrections", {
        quoteData: { ...data, vehicle: { ...data.vehicle, plate } },
        reason: "Targa corretta dal libretto",
      });
    }
  }
  if (data && step === "BIRTH_DATE") {
    const birthDate = parseItalianDate(corrected) ?? corrected;
    const owner =
      data.vehicleOwner === "SAME_AS_POLICY_HOLDER" ? data.policyHolder : data.vehicleOwner;
    if (owner.kind === "PERSON" && owner.birthDate !== birthDate) {
      const fix = <T extends { kind: string; fiscalCode?: string }>(person: T): T =>
        person.kind === "PERSON" && person.fiscalCode === owner.fiscalCode
          ? { ...person, birthDate }
          : person;
      await post(id, "corrections", {
        quoteData: {
          ...data,
          policyHolder: fix(data.policyHolder),
          vehicleOwner:
            data.vehicleOwner === "SAME_AS_POLICY_HOLDER"
              ? data.vehicleOwner
              : fix(data.vehicleOwner),
          drivers: data.drivers.map((d) => ({ ...d, person: fix(d.person) })),
        },
        reason: "Data di nascita corretta dai documenti",
      });
    }
  }
  await put(id, step, {
    value: step === "BIRTH_DATE" ? (parseItalianDate(corrected) ?? corrected) : corrected,
  });
  revalidatePath(`/verifiche/${id}`);
  redirect(`/verifiche/${id}#verifiche`);
}

/** «Leggi da ANIA» with the plate of the request. */
export async function readAnia(formData: FormData): Promise<void> {
  const id = idOf(formData);
  await post(id, "ania", {});
  revalidatePath(`/verifiche/${id}`);
  redirect(`/verifiche/${id}#scheda`);
}

/**
 * The insurance history read from ANIA into the data of the request: class,
 * insurer, expiry and the dates of the vehicle, as a correction.
 */
export async function applyAnia(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const { body: card } = await api<{
    quoteData: QuoteData | null;
    verification: { ania: { sheet: AniaSheet } | null } | null;
  }>(`/verification/requests/${id}`);
  const data = card.quoteData;
  const sheet = card.verification?.ania?.sheet;
  if (!data || !sheet) redirect(`/verifiche/${id}?errore=CONFLICT#scheda`);
  const cuClass = Number(sheet.cuClass);
  const corrected: QuoteData = {
    ...data,
    vehicle: {
      ...data.vehicle,
      ...(sheet.firstRegistrationDate
        ? { firstRegistrationDate: sheet.firstRegistrationDate }
        : {}),
      ...(sheet.purchaseDate ? { purchaseDate: sheet.purchaseDate } : {}),
    },
    history: {
      ...data.history,
      ...(Number.isInteger(cuClass) && cuClass >= 1 ? { cuClass } : {}),
      ...(sheet.currentInsurer?.name ? { currentInsurer: sheet.currentInsurer.name } : {}),
      ...(sheet.coverExpiry ? { currentExpiryDate: sheet.coverExpiry } : {}),
    },
  };
  if (JSON.stringify(corrected) === JSON.stringify(data)) {
    redirect(`/verifiche/${id}?fatto=ania#scheda`);
  }
  await post(id, "corrections", { quoteData: corrected, reason: "Dati letti da ANIA" });
  redirect(`/verifiche/${id}?fatto=ania#scheda`);
}

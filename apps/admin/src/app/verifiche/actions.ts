"use server";

import { parseItalianDate, type QuoteData } from "@astax/shared/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

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
 * Dan, 2026-10-28 (docs/piano-dati-dal-bot.md): «Confermo la correttezza dei
 * dati estratti dal bot»: the API builds the data from the bots and opens the auction.
 */
export async function confirmBotData(formData: FormData): Promise<void> {
  const id = idOf(formData);
  if (formData.get("confirmed") !== "1") redirect(`/verifiche/${id}?errore=NOT_CONFIRMED`);
  await post(id, "bot-confirm", {});
  redirect("/verifiche?fatto=approvata");
}

/** Audit of 2026-10-30 (E3): the back office supervisor cancels a request (request.cancel). */
export async function cancelRequestByBackOffice(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const { status, body } = await api(`/requests/${id}/cancel`, { method: "POST", body: "{}" });
  revalidatePath(`/verifiche/${id}`);
  if (status !== 200) redirect(`/verifiche/${id}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/verifiche/${id}?fatto=annullata`);
}

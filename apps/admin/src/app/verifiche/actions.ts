"use server";

import type { QuoteData } from "@astax/shared/domain";
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
  redirect(`/verifiche/${id}#agenzie`);
}

export async function includeAgency(formData: FormData): Promise<void> {
  const id = idOf(formData);
  const organizationId = organizationOf(formData, id);
  await post(id, `agencies/${organizationId}/include`, {});
  redirect(`/verifiche/${id}#agenzie`);
}

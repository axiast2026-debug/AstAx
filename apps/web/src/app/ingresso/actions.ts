"use server";

import { redirect } from "next/navigation";
import { problemCodes } from "@/lib/problem-codes";
import { publicApi } from "@/lib/public-api";

/** The entry of agencies and brokers (phase 7): no account, the private link is the proof. */
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { issue: string }[] };
  return problem.errors?.length
    ? [...new Set(problem.errors.map((e) => e.issue))].join(",")
    : (problem.code ?? "INTERNAL");
}

function tokenOf(formData: FormData): string {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) redirect("/ingresso");
  return token;
}

function inputOf(formData: FormData) {
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  return {
    // A section E intermediary of an agency enters as an agency (step 5 of docs/piano-agenzie.md).
    type:
      value("ruiNumber").toUpperCase().startsWith("E") &&
      value("principalRuiNumber").toUpperCase().startsWith("A")
        ? "AGENCY"
        : value("type") === "BROKER"
          ? "BROKER"
          : "AGENCY",
    legalName: value("legalName"),
    vatNumber: value("vatNumber"),
    fiscalCode: value("fiscalCode") || null,
    ruiNumber: value("ruiNumber").toUpperCase(),
    // Section E only (docs/piano-broker.md, A).
    principalRuiNumber: value("principalRuiNumber").toUpperCase() || null,
    pec: value("pec"),
    // Dan, 2026-10-29: the municipality from the list; the province comes from it; no IBAN.
    address: {
      street: value("street"),
      postalCode: value("address.postalCode"),
      municipalityIstat: value("address.municipalityIstat"),
    },
    owner: {
      firstName: value("firstName"),
      lastName: value("lastName"),
      email: value("email"),
      phone: value("phone").replace(/\s/g, ""),
    },
    companyIds: formData.getAll("companyIds").map(String),
  };
}

/** Dan, 2026-10-29: on an error the form keeps what was typed and marks the wrong fields. */
export async function startOnboarding(formData: FormData): Promise<string | undefined> {
  const { status, body } = await publicApi<{ token: string }>("/onboarding", {
    method: "POST",
    body: JSON.stringify(inputOf(formData)),
  });
  if (status !== 201) return problemCodes(body);
  redirect(`/ingresso/${body.token}?fatto=creata`);
}

export async function updateOnboarding(formData: FormData): Promise<string | undefined> {
  const token = tokenOf(formData);
  const { status, body } = await publicApi(`/onboarding/${token}`, {
    method: "PUT",
    body: JSON.stringify(inputOf(formData)),
  });
  if (status !== 200) return problemCodes(body);
  redirect(`/ingresso/${token}?fatto=salvata`);
}

export async function submitOnboarding(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const versionIds = formData.getAll("versionIds").map(String);
  const required = formData.getAll("required").map(String);
  if (required.some((id) => !versionIds.includes(id))) {
    redirect(`/ingresso/${token}?errore=NOT_ACCEPTED`);
  }
  const { status, body } = await publicApi(`/onboarding/${token}/submit`, {
    method: "POST",
    body: JSON.stringify({ versionIds }),
  });
  if (status !== 200) redirect(`/ingresso/${token}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/ingresso/${token}?fatto=inviata`);
}

"use server";

import { redirect } from "next/navigation";
import { publicApi } from "@/lib/public-api";

/** The entry of agencies and brokers (phase 7): no account, the private link is the proof. */
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
    type: value("type") === "BROKER" ? "BROKER" : "AGENCY",
    legalName: value("legalName"),
    vatNumber: value("vatNumber"),
    fiscalCode: value("fiscalCode") || null,
    ruiNumber: value("ruiNumber").toUpperCase(),
    // Section E only (docs/piano-broker.md, A).
    principalRuiNumber: value("principalRuiNumber").toUpperCase() || null,
    pec: value("pec"),
    address: {
      street: value("street"),
      postalCode: value("postalCode"),
      municipalityIstat: value("municipalityIstat"),
      province: value("province").toUpperCase(),
    },
    iban: value("iban"),
    owner: {
      firstName: value("firstName"),
      lastName: value("lastName"),
      email: value("email"),
      phone: value("phone").replace(/\s/g, ""),
    },
    companyIds: formData.getAll("companyIds").map(String),
  };
}

export async function startOnboarding(formData: FormData): Promise<void> {
  const input = inputOf(formData);
  const { status, body } = await publicApi<{ token: string }>("/onboarding", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (status !== 201) {
    const kind = input.ruiNumber.startsWith("E") ? "E" : input.type;
    redirect(`/ingresso?tipo=${kind}&errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(`/ingresso/${body.token}?fatto=creata`);
}

export async function updateOnboarding(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const { status, body } = await publicApi(`/onboarding/${token}`, {
    method: "PUT",
    body: JSON.stringify(inputOf(formData)),
  });
  if (status !== 200) {
    redirect(`/ingresso/${token}?modifica=1&errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(`/ingresso/${token}?fatto=salvata`);
}

export async function sendIbanCode(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const { status } = await publicApi(`/onboarding/${token}/iban-code`, {
    method: "POST",
    body: "{}",
  });
  redirect(
    `/ingresso/${token}?codice=inviato${status === 204 ? "" : status === 429 ? "&errore=RATE_LIMITED" : "&errore=INTERNAL"}`,
  );
}

export async function confirmIban(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const { status } = await publicApi(`/onboarding/${token}/iban-confirm`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (status !== 200) redirect(`/ingresso/${token}?codice=inviato&errore=OTP_INVALID`);
  redirect(`/ingresso/${token}?fatto=iban`);
}

export async function uploadProfInsurance(formData: FormData): Promise<void> {
  const token = tokenOf(formData);
  const expiresOn = String(formData.get("expiresOn") ?? "");
  const file = formData.get("file");
  if (!DAY.test(expiresOn) || !(file instanceof File) || file.size === 0) {
    redirect(`/ingresso/${token}?errore=PDF_REQUIRED`);
  }
  const { status, body } = await publicApi(
    `/onboarding/${token}/prof-insurance?expiresOn=${expiresOn}`,
    {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: new Uint8Array(await file.arrayBuffer()),
    },
  );
  if (status !== 200) redirect(`/ingresso/${token}?errore=${encodeURIComponent(codesOf(body))}`);
  redirect(`/ingresso/${token}?fatto=polizza`);
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

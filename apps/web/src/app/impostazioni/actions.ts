"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/auth";
import { problemCodes } from "@/lib/problem-codes";

/**
 * «Impostazioni» of the owner (audit of 2026-10-30, A3). Errors come back as
 * codes for the form (ActionForm); the API checks everything again.
 */
const PAGE = "/impostazioni";

export async function saveOrganizationProfile(formData: FormData): Promise<string | undefined> {
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  const { status, body } = await api(`/organization/settings`, {
    method: "PUT",
    body: JSON.stringify({
      pec: value("pec"),
      address: {
        street: value("street"),
        postalCode: value("address.postalCode"),
        municipalityIstat: value("address.municipalityIstat"),
      },
    }),
  });
  if (status !== 200) return problemCodes(body);
  revalidatePath(PAGE);
  redirect(`${PAGE}?fatto=dati`);
}

export async function sendSettingsIbanCode(formData: FormData): Promise<string | undefined> {
  const phone = String(formData.get("phone") ?? "").trim();
  const { status, body } = await api(`/organization/iban/code`, {
    method: "POST",
    body: JSON.stringify(phone ? { phone } : {}),
  });
  if (status !== 204) return problemCodes(body);
  redirect(`${PAGE}?iban=codice#iban`);
}

export async function changeSettingsIban(formData: FormData): Promise<string | undefined> {
  const { status, body } = await api(`/organization/iban`, {
    method: "POST",
    body: JSON.stringify({
      iban: String(formData.get("iban") ?? ""),
      code: String(formData.get("code") ?? "").replace(/\s/g, ""),
    }),
  });
  if (status !== 200) return problemCodes(body);
  revalidatePath(PAGE);
  redirect(`${PAGE}?fatto=iban#iban`);
}

export async function requestMandatesChange(formData: FormData): Promise<string | undefined> {
  const { status, body } = await api(`/organization/mandates/request`, {
    method: "POST",
    body: JSON.stringify({ text: String(formData.get("text") ?? "").trim() }),
  });
  if (status !== 201) return problemCodes(body);
  redirect(`${PAGE}?fatto=mandati#mandati`);
}

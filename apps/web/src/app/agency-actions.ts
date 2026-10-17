"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/auth";
import { euroToCents } from "@/lib/agency";

/**
 * Actions of the agency area (spec 04). Errors come back as codes in the
 * `errore` parameter, never as values; the API checks every rule again.
 */
const uuid = /^[0-9a-f-]{36}$/i;

function idOf(formData: FormData, name: string): string {
  const id = String(formData.get(name) ?? "");
  if (!uuid.test(id)) redirect("/richieste-in-arrivo");
  return id;
}

const back = (auctionId: string, query = "") => `/richieste-in-arrivo/${auctionId}${query}`;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { path: string; issue: string }[] };
  return problem.errors?.length
    ? problem.errors
        .map((e) => (e.path && !e.issue.includes(":") ? `${e.path}:${e.issue}` : e.issue))
        .join(",")
    : (problem.code ?? "INTERNAL");
}

async function post(auctionId: string, path: string, payload: unknown = {}) {
  const { status, body } = await api(path, { method: "POST", body: JSON.stringify(payload) });
  if (status !== 200) redirect(back(auctionId, `?errore=${encodeURIComponent(codesOf(body))}`));
}

export async function claimRequest(formData: FormData): Promise<void> {
  const auctionId = idOf(formData, "auctionId");
  await post(auctionId, `/auctions/${auctionId}/claim`);
  redirect(back(auctionId));
}

export async function releaseRequest(formData: FormData): Promise<void> {
  const auctionId = idOf(formData, "auctionId");
  await post(auctionId, `/auctions/${auctionId}/release`);
  redirect(back(auctionId));
}

export async function declineRequest(formData: FormData): Promise<void> {
  const auctionId = idOf(formData, "auctionId");
  const reasonCode = String(formData.get("reasonCode") ?? "");
  await post(auctionId, `/auctions/${auctionId}/decline`, reasonCode ? { reasonCode } : {});
  redirect("/richieste-in-arrivo?fatto=rinuncia");
}

export async function assignClaim(formData: FormData): Promise<void> {
  const auctionId = idOf(formData, "auctionId");
  await post(auctionId, `/agency/requests/${auctionId}/assign`, {
    membershipId: idOf(formData, "membershipId"),
  });
  redirect(back(auctionId));
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const intOf = (formData: FormData, name: string) => {
  const value = text(formData, name).replace(/\./g, "");
  return /^\d+$/.test(value) ? Number(value) : -1;
};
const included = (formData: FormData, item: string) =>
  formData.get(`coverage.${item}.included`) === "on";

/** The coverage declared item by item (OFF-04), as the API expects it. */
function coverageOf(formData: FormData) {
  const withCoinsurance = (item: string) =>
    included(formData, item)
      ? {
          included: true,
          coinsurancePct: intOf(formData, `coverage.${item}.coinsurancePct`),
          coinsuranceMinEur: intOf(formData, `coverage.${item}.coinsuranceMinEur`),
        }
      : { included: false };
  const theftFire = withCoinsurance("theftFire");
  return {
    rca:
      text(formData, "coverage.rca.limitType") === "SEPARATE_LIMITS"
        ? {
            limitType: "SEPARATE_LIMITS",
            bodilyInjuryPerClaimEur: intOf(formData, "coverage.rca.bodilyInjuryPerClaimEur"),
            propertyDamagePerClaimEur: intOf(formData, "coverage.rca.propertyDamagePerClaimEur"),
          }
        : {
            limitType: "SINGLE_LIMIT",
            singleLimitEur: intOf(formData, "coverage.rca.singleLimitEur"),
          },
    recourseWaiver: included(formData, "recourseWaiver")
      ? { included: true, cases: formData.getAll("coverage.recourseWaiver.cases").map(String) }
      : { included: false },
    roadsideAssistance: { included: included(formData, "roadsideAssistance") },
    legalProtection: { included: included(formData, "legalProtection") },
    driverAccident: included(formData, "driverAccident")
      ? { included: true, capitalEur: intOf(formData, "coverage.driverAccident.capitalEur") }
      : { included: false },
    theftFire: theftFire.included
      ? { ...theftFire, marketValue: formData.get("coverage.theftFire.marketValue") === "on" }
      : theftFire,
    naturalEventsVandalism: withCoinsurance("naturalEventsVandalism"),
    glass: included(formData, "glass")
      ? { included: true, deductibleEur: intOf(formData, "coverage.glass.deductibleEur") }
      : { included: false },
  };
}

/**
 * The offer (OFF-04): the content in the x-offer header, the PDF as the body.
 * A new offer, or a change of the agency's offer until the closing (OFF-07).
 */
export async function sendOffer(formData: FormData): Promise<void> {
  const auctionId = idOf(formData, "auctionId");
  const offerId = text(formData, "offerId");
  // GAR-07, proposal C: «Conferma» keeps the premium of the previous round.
  const confirm = formData.get("mode") === "confirm";
  const cents = euroToCents(text(formData, confirm ? "previousPremium" : "premium"));
  if (cents === null) redirect(back(auctionId, "?errore=PREMIUM_INVALID"));
  const offer = {
    annualGrossPremiumCents: cents,
    companyId: text(formData, "companyId"),
    productId: text(formData, "productId"),
    coverage: coverageOf(formData),
    guaranteeUntil: text(formData, "guaranteeUntil"),
    notes: text(formData, "notes") || null,
    binding: formData.get("binding") === "on",
  };
  const file = formData.get("pdf");
  const pdf =
    file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : null;
  const path = uuid.test(offerId) ? `/offers/${offerId}` : `/auctions/${auctionId}/offers`;
  const { status, body } = await api<{ coverageWarnings?: string[] }>(path, {
    method: uuid.test(offerId) ? "PUT" : "POST",
    headers: {
      "x-offer": Buffer.from(JSON.stringify(offer)).toString("base64url"),
      ...(pdf ? { "content-type": "application/pdf" } : {}),
    },
    ...(pdf ? { body: pdf } : {}),
  });
  if (status !== 200 && status !== 201) {
    redirect(back(auctionId, `?errore=${encodeURIComponent(codesOf(body))}`));
  }
  const warnings = body.coverageWarnings ?? [];
  redirect(
    back(auctionId, `?fatto=offerta${warnings.length ? `&coperture=${warnings.join(",")}` : ""}`),
  );
}

export async function withdrawOffer(formData: FormData): Promise<void> {
  const auctionId = idOf(formData, "auctionId");
  await post(auctionId, `/offers/${idOf(formData, "offerId")}/withdraw`);
  redirect(back(auctionId, "?fatto=ritirata"));
}

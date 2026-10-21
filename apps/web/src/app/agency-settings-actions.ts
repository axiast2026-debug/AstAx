"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/auth";

/**
 * Actions of «Filtri e capacità», of the product library and of «Team»
 * (spec 04). Errors come back as codes in `errore`; the API checks every rule.
 */
const uuid = /^[0-9a-f-]{36}$/i;
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function codesOf(body: unknown): string {
  const problem = (body ?? {}) as { code?: string; errors?: { path: string; issue: string }[] };
  return problem.errors?.length
    ? problem.errors
        .map((e) => (e.path && !e.issue.includes(":") ? `${e.path}:${e.issue}` : e.issue))
        .join(",")
    : (problem.code ?? "INTERNAL");
}

async function send(back: string, path: string, method: string, payload: unknown, done: string) {
  const { status, body } = await api(path, { method, body: JSON.stringify(payload) });
  if (status !== 200 && status !== 201 && status !== 204) {
    redirect(`${back}?errore=${encodeURIComponent(codesOf(body))}`);
  }
  redirect(`${back}?fatto=${done}`);
}

const text = (f: FormData, name: string) => String(f.get(name) ?? "").trim();
const int = (f: FormData, name: string) => {
  const v = text(f, name);
  return /^\d+$/.test(v) ? Number(v) : null;
};
const list = (f: FormData, name: string) => f.getAll(name).map(String).filter(Boolean);

/** Filters from the form; a prefix tells the agency's from the personal ones. */
function criteriaOf(f: FormData, p: string) {
  const provinces = text(f, `${p}.provinces`)
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  return {
    vehicleTypes: list(f, `${p}.vehicleTypes`),
    provinces: provinces.length > 0 ? provinces : null,
    cuClassMin: int(f, `${p}.cuClassMin`) ?? 1,
    cuClassMax: int(f, `${p}.cuClassMax`) ?? 18,
    maxClaimsLast5y: int(f, `${p}.maxClaimsLast5y`),
    driverAgeMin: int(f, `${p}.driverAgeMin`) ?? 18,
    driverAgeMax: int(f, `${p}.driverAgeMax`) ?? 99,
    packages: list(f, `${p}.packages`),
    companies: list(f, `${p}.companies`),
    maxStartDateDays: int(f, `${p}.maxStartDateDays`) ?? 0,
    maxGuaranteeDays: int(f, `${p}.maxGuaranteeDays`) ?? 0,
    // ADR 0014, answer 4: the requests of the brokers' lots sent without documents.
    acceptsWithoutDocuments: f.get(`${p}.acceptsWithoutDocuments`) === "on",
  };
}

export async function saveAgencyFilters(formData: FormData): Promise<void> {
  await send("/filtri", "/agency/filters", "PUT", criteriaOf(formData, "agency"), "filtri");
}

export async function saveMyFilters(formData: FormData): Promise<void> {
  const criteria = formData.get("remove") === "on" ? null : criteriaOf(formData, "mine");
  await send("/filtri", "/agency/filters/mine", "PUT", { criteria }, "personali");
}

/** «09:00-13:00, 14:00-19:00» for each day; empty means closed. */
function hoursOf(value: string): [string, string][] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [from = "", to = ""] = part.split("-").map((x) => x.trim());
      return [from.padStart(5, "0"), to.padStart(5, "0")];
    });
}

export async function saveCapacity(formData: FormData): Promise<void> {
  const pause = text(formData, "pausedUntil");
  await send(
    "/filtri",
    "/agency/capacity",
    "PUT",
    {
      dailyMax: int(formData, "dailyMax"),
      receptionHours: Object.fromEntries(
        WEEKDAYS.map((d) => [d, hoursOf(text(formData, `hours.${d}`))]),
      ),
      // The end of the chosen day, Rome time (CET/CEST): never before that day ends.
      pausedUntil: /^\d{4}-\d{2}-\d{2}$/.test(pause) ? `${pause}T23:59:00+01:00` : null,
      distribution: text(formData, "distribution") || "ALL_USERS",
    },
    "capacita",
  );
}

// ------------------------------------------------------------ products

export async function createProduct(formData: FormData): Promise<void> {
  await send(
    "/agenzia",
    "/agency/products",
    "POST",
    { companyId: text(formData, "companyId"), name: text(formData, "name") },
    "prodotto",
  );
}

export async function setProductActive(formData: FormData): Promise<void> {
  const id = text(formData, "productId");
  if (!uuid.test(id)) redirect("/agenzia");
  await send(
    "/agenzia",
    `/agency/products/${id}`,
    "PATCH",
    { active: formData.get("active") === "true" },
    "prodotto",
  );
}

export async function uploadProductDocument(formData: FormData): Promise<void> {
  const id = text(formData, "productId");
  const kind = text(formData, "kind");
  if (!uuid.test(id) || !/^PRODUCT_[A-Z_]+$/.test(kind)) redirect("/agenzia");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/agenzia?errore=file:PDF_REQUIRED");
  const { status, body } = await api(`/agency/products/${id}/documents?kind=${kind}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: new Uint8Array(await file.arrayBuffer()),
  });
  if (status !== 201) redirect(`/agenzia?errore=${encodeURIComponent(codesOf(body))}`);
  redirect("/agenzia?fatto=documento");
}

// ------------------------------------------------------------ team

const FLAGS = ["canIssue", "canSeeColleagueOffers", "canSeeAccounting", "seesAllClients"] as const;

export async function inviteMember(formData: FormData): Promise<void> {
  const flags = Object.fromEntries(
    FLAGS.filter((f) => formData.has(`flag.${f}`)).map((f) => [f, true]),
  );
  await send(
    "/team",
    "/team/invites",
    "POST",
    {
      email: text(formData, "email"),
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      role: text(formData, "role"),
      flags,
    },
    "invito",
  );
}

export async function revokeInvite(formData: FormData): Promise<void> {
  const id = text(formData, "inviteId");
  if (!uuid.test(id)) redirect("/team");
  await send("/team", `/team/invites/${id}`, "DELETE", {}, "revocato");
}

/** Role and flags of a member: every flag of the form is sent, checked or not. */
export async function updateMember(formData: FormData): Promise<void> {
  const id = text(formData, "membershipId");
  if (!uuid.test(id)) redirect("/team");
  const shown = list(formData, "shownFlags");
  const flags = Object.fromEntries(
    FLAGS.filter((f) => shown.includes(f)).map((f) => [f, formData.has(`flag.${f}`)]),
  );
  await send(
    "/team",
    `/team/members/${id}`,
    "PATCH",
    { role: text(formData, "role") || undefined, flags },
    "modificato",
  );
}

export async function setMemberStatus(formData: FormData): Promise<void> {
  const id = text(formData, "membershipId");
  const status = text(formData, "status");
  if (!uuid.test(id) || !["ACTIVE", "SUSPENDED"].includes(status)) redirect("/team");
  await send("/team", `/team/members/${id}`, "PATCH", { status }, "stato");
}

export async function removeMember(formData: FormData): Promise<void> {
  const id = text(formData, "membershipId");
  if (!uuid.test(id)) redirect("/team");
  await send("/team", `/team/members/${id}`, "DELETE", {}, "rimosso");
}

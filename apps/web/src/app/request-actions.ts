"use server";

import { SystemClock } from "@astax/adapters/clock";
import { decodeFiscalCode } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, sessionId, webAuth, browserClient } from "@/lib/auth";
import { claimYears, requestOptions } from "@/lib/requests";
import { SEARCH_SCOPES, writeSearch, type SearchScope } from "@/lib/search";
import {
  checked,
  historyFromForm,
  licenceFromForm,
  personFieldsFromForm,
  requestTermsFromForm,
  text,
  vehicleFromForm,
  type PersonFields,
} from "@/lib/wizard-forms";

/**
 * Server actions of the request wizards (private and broker). Every error
 * comes back as codes in the `errore` query parameter: field paths and issue
 * codes, never the values typed by the user (CLAUDE.md rule 8).
 */
const clock = new SystemClock();
const today = () => romeCalendarDate(clock.now());
const HINT_COOKIE = "astax_plate_hint";

interface Problem {
  code?: string;
  errors?: { path: string; issue: string }[];
}

function problemCodes(body: unknown): string {
  const problem = (body ?? {}) as Problem;
  const codes = problem.errors?.length
    ? problem.errors.map((e) =>
        e.path && !e.issue.includes(":") ? `${e.path}:${e.issue}` : e.issue,
      )
    : [problem.code ?? "INTERNAL"];
  return [...new Set(codes)].slice(0, 10).join(",");
}

function back(path: string, codes: string): never {
  redirect(`${path}?errore=${encodeURIComponent(codes)}`);
}

function requestId(value: FormDataEntryValue | null): string {
  const id = String(value ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/");
  return id;
}

function basePath(value: FormDataEntryValue | null): string {
  const base = String(value ?? "");
  return base === "/richieste" ? "/richieste" : "/preventivi";
}

async function saveSection(
  id: string,
  section: string,
  value: unknown,
): Promise<{ ok: boolean; codes: string }> {
  const { status, body } = await api(`/requests/${id}/draft/${section}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  return { ok: status === 200, codes: status === 200 ? "" : problemCodes(body) };
}

async function uploadFile(
  id: string,
  kind: string,
  file: FormDataEntryValue | null,
  driverIndex?: number,
) {
  if (!(file instanceof File) || file.size === 0) return { ok: true, codes: "" };
  const query = `kind=${kind}${driverIndex === undefined ? "" : `&driverIndex=${driverIndex}`}`;
  const response = await webAuth().api(
    await sessionId(),
    `/requests/${id}/documents?${query}`,
    {
      method: "POST",
      body: new Uint8Array(await file.arrayBuffer()),
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name),
      },
    },
    await browserClient(),
  );
  const body = response.status === 201 ? null : await response.json().catch(() => null);
  return { ok: response.status === 201, codes: response.status === 201 ? "" : problemCodes(body) };
}

// -------------------------------------------------------------- creation

export async function createPrivateRequest(): Promise<void> {
  const { status, body } = await api<{ id: string }>("/requests", { method: "POST", body: "{}" });
  if (status !== 201) back("/preventivi", problemCodes(body));
  redirect(`/preventivi/${body.id}/veicolo`);
}

export async function createBrokerRequest(formData: FormData): Promise<void> {
  const customerId = requestId(formData.get("customerId"));
  const { status, body } = await api<{ id: string }>("/requests", {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
  if (status !== 201) back("/richieste/nuova", problemCodes(body));
  redirect(`/richieste/${body.id}/veicolo`);
}

export async function createCustomer(formData: FormData): Promise<void> {
  const kind = text(formData, "kind") === "COMPANY" ? "COMPANY" : "PERSON";
  const contacts = { email: text(formData, "email"), phone: text(formData, "phone") };
  const payload =
    kind === "PERSON"
      ? {
          kind,
          surname: text(formData, "surname"),
          givenName: text(formData, "givenName"),
          fiscalCode: text(formData, "fiscalCode"),
          ...contacts,
        }
      : {
          kind,
          companyName: text(formData, "companyName"),
          vatNumber: text(formData, "vatNumber"),
          ...contacts,
        };
  const { status, body } = await api<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (status !== 201) back("/clienti/nuovo", problemCodes(body));
  if (formData.get("then") === "request") {
    const created = await api<{ id: string }>("/requests", {
      method: "POST",
      body: JSON.stringify({ customerId: body.id }),
    });
    if (created.status !== 201) back(`/clienti/${body.id}`, problemCodes(created.body));
    redirect(`/richieste/${created.body.id}/veicolo`);
  }
  redirect(`/clienti/${body.id}`);
}

// -------------------------------------------------------------- step 1: vehicle and history

/** Vehicle data from the plate, kept for a few minutes in a server-only cookie to prefill the form. */
export async function lookupPlate(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const plate = text(formData, "lookup.plate");
  const vehicleType = text(formData, "lookup.type");
  const { status, body } = await api<{
    found: boolean;
    reason?: string;
    vehicle?: Record<string, unknown>;
  }>("/vehicle-data/lookup", {
    method: "POST",
    body: JSON.stringify({ plate, ...(vehicleType ? { vehicleType } : {}) }),
  });
  if (status !== 200) back(`${base}/${id}/veicolo`, problemCodes(body));
  if (!body.found) back(`${base}/${id}/veicolo`, `PLATE_${body.reason ?? "NOT_FOUND"}`);
  (await cookies()).set(
    HINT_COOKIE,
    JSON.stringify({ requestId: id, plate, vehicleType, ...body.vehicle }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    },
  );
  redirect(`${base}/${id}/veicolo`);
}

export async function readPlateHint(id: string): Promise<Record<string, string> | null> {
  const raw = (await cookies()).get(HINT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const hint = JSON.parse(raw) as Record<string, unknown>;
    if (hint.requestId !== id) return null;
    return Object.fromEntries(Object.entries(hint).map(([k, v]) => [k, String(v)]));
  } catch {
    return null;
  }
}

export async function uploadDocument(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const step = text(formData, "step") ?? "veicolo";
  const kind = text(formData, "kind") ?? "OTHER";
  const driver = text(formData, "driverIndex");
  const result = await uploadFile(
    id,
    kind,
    formData.get("file"),
    driver === undefined ? undefined : Number(driver),
  );
  const target = `${base}/${id}/${step}`;
  if (!result.ok) back(target, result.codes);
  redirect(target);
}

export async function saveVehicleStep(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const here = `${base}/${id}/veicolo`;
  const specialUses = formData.getAll("specialUses").map(String);
  const uses = await api(`/requests/${id}/draft/special-uses`, {
    method: "PUT",
    body: JSON.stringify({ specialUses }),
  });
  if (uses.status !== 200) back(here, problemCodes(uses.body));
  const vehicle = await saveSection(id, "vehicle", vehicleFromForm(formData));
  const years = claimYears(undefined, today());
  const history = await saveSection(id, "history", historyFromForm(formData, years));
  const codes = [vehicle.codes, history.codes].filter(Boolean).join(",");
  if (codes) back(here, codes);
  (await cookies()).delete(HINT_COOKIE);
  redirect(`${base}/${id}/conducenti`);
}

// -------------------------------------------------------------- step 2: people and drivers

interface Municipality {
  istatCode: string;
  name: string;
  province: string;
}

/**
 * A natural person from the form: birth date, sex and birth place come from
 * the fiscal code; the municipality of residence from its name and province.
 */
async function personFrom(
  fields: PersonFields,
  prefix: string,
): Promise<{ person?: object; codes: string[] }> {
  const decoded = fields.fiscalCode ? decodeFiscalCode(fields.fiscalCode, today()) : null;
  if (!decoded) return { codes: [`${prefix}.fiscalCode:INVALID_FISCAL_CODE`] };
  let birthPlace: string | undefined = decoded.birthPlaceCadastralCode;
  if (!decoded.bornAbroad) {
    const found = await api<Municipality[]>(
      `/reference/municipalities?cadastral=${decoded.birthPlaceCadastralCode}`,
    );
    birthPlace = found.body[0]?.istatCode;
    if (!birthPlace) return { codes: [`${prefix}.fiscalCode:BIRTH_PLACE_UNKNOWN`] };
  }
  const query = encodeURIComponent(fields.municipality ?? "");
  const candidates = fields.municipality
    ? (await api<Municipality[]>(`/reference/municipalities?q=${query}`)).body
    : [];
  const residence = candidates.find(
    (m) =>
      m.name.toLowerCase() === fields.municipality?.toLowerCase() &&
      (!fields.province || m.province === fields.province),
  );
  if (!residence) return { codes: [`${prefix}.municipality:MUNICIPALITY_NOT_FOUND`] };
  return {
    codes: [],
    person: {
      kind: "PERSON",
      surname: fields.surname,
      givenName: fields.givenName,
      fiscalCode: fields.fiscalCode,
      birthDate: decoded.birthDate,
      birthPlace,
      sex: decoded.sex,
      residence: {
        street: fields.street,
        postalCode: fields.postalCode,
        municipalityIstat: residence.istatCode,
        province: residence.province,
      },
      ...(fields.profession ? { profession: fields.profession } : {}),
      ...(fields.maritalStatus ? { maritalStatus: fields.maritalStatus } : {}),
      ...(fields.children === undefined ? {} : { children: fields.children }),
    },
  };
}

export async function saveDriversStep(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const here = `${base}/${id}/conducenti`;
  const codes: string[] = [];

  const holderKind = text(formData, "policyHolder.kind") === "COMPANY" ? "COMPANY" : "PERSON";
  let holder: object | undefined;
  if (holderKind === "COMPANY") {
    const office = personFieldsFromForm(formData, "policyHolder");
    const query = encodeURIComponent(office.municipality ?? "");
    const found = office.municipality
      ? (await api<Municipality[]>(`/reference/municipalities?q=${query}`)).body
      : [];
    const seat = found.find((m) => m.name.toLowerCase() === office.municipality?.toLowerCase());
    if (!seat) codes.push("policyHolder.municipality:MUNICIPALITY_NOT_FOUND");
    holder = {
      kind: "COMPANY",
      companyName: text(formData, "policyHolder.companyName"),
      vatNumber: text(formData, "policyHolder.vatNumber"),
      registeredOffice: {
        street: office.street,
        postalCode: office.postalCode,
        municipalityIstat: seat?.istatCode,
        province: seat?.province,
      },
    };
  } else {
    const result = await personFrom(personFieldsFromForm(formData, "policyHolder"), "policyHolder");
    holder = result.person;
    codes.push(...result.codes);
  }

  let owner: object | string = "SAME_AS_POLICY_HOLDER";
  if (!checked(formData, "ownerIsHolder")) {
    const result = await personFrom(personFieldsFromForm(formData, "vehicleOwner"), "vehicleOwner");
    owner = result.person ?? {};
    codes.push(...result.codes);
  }

  const drivers: object[] = [];
  const holderIsDriver = holderKind === "PERSON" && checked(formData, "holderDrives");
  if (holderIsDriver && holder)
    drivers.push({ person: holder, isMain: true, licence: licenceFromForm(formData, "driver0") });
  if (checked(formData, "otherDriver") || !holderIsDriver) {
    const result = await personFrom(personFieldsFromForm(formData, "driver1"), "driver1");
    codes.push(...result.codes);
    if (result.person) {
      drivers.push({
        person: result.person,
        isMain: !holderIsDriver,
        licence: licenceFromForm(formData, "driver1"),
      });
    }
  }
  if (codes.length > 0) back(here, codes.join(","));

  const saved = [
    await saveSection(id, "policyHolder", holder),
    await saveSection(id, "vehicleOwner", owner),
    await saveSection(id, "driving", { drivers, drivingFormula: text(formData, "drivingFormula") }),
  ];
  const errors = saved
    .map((s) => s.codes)
    .filter(Boolean)
    .join(",");
  if (errors) back(here, errors);
  redirect(`${base}/${id}/copertura`);
}

// -------------------------------------------------------------- steps 3 and 4: coverage and auction

export async function saveCoverageStep(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const step = text(formData, "step") === "asta" ? "asta" : "copertura";
  const options = await requestOptions();
  const terms = requestTermsFromForm(formData, {
    auctionDurationHours: options.defaultAuctionDurationHours,
    minValidityDays: options.defaultMinValidityDays,
  });
  const saved = await saveSection(id, "request", terms);
  if (!saved.ok) back(`${base}/${id}/${step}`, saved.codes);
  redirect(
    `${base}/${id}/${step === "copertura" ? "asta" : base === "/richieste" ? "consenso" : "consensi"}`,
  );
}

// -------------------------------------------------------------- consent

export async function sendConsentCode(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const { status, body } = await api(`/requests/${id}/consent/code`, {
    method: "POST",
    body: "{}",
  });
  if (status !== 204) back(`/preventivi/${id}/consensi`, problemCodes(body));
  redirect(`/preventivi/${id}/consensi?codice=inviato`);
}

export async function confirmConsent(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const code = (text(formData, "code") ?? "").replace(/\s/g, "");
  const { status, body } = await api(`/requests/${id}/consent/confirm`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (status !== 200) back(`/preventivi/${id}/consensi`, problemCodes(body));
  redirect(`/preventivi/${id}/riepilogo`);
}

export async function sendConsentLink(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const { status, body } = await api(`/requests/${id}/consent/link`, {
    method: "POST",
    body: "{}",
  });
  if (status !== 200) back(`/richieste/${id}/consenso`, problemCodes(body));
  redirect(`/richieste/${id}/consenso?link=inviato`);
}

export async function uploadConsent(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const here = `/richieste/${id}/consenso`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back(here, "file:required");
  const response = await webAuth().api(
    await sessionId(),
    `/requests/${id}/documents?kind=CONSENT_FORM`,
    {
      method: "POST",
      body: new Uint8Array(await file.arrayBuffer()),
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name),
      },
    },
    await browserClient(),
  );
  const uploaded = (await response.json().catch(() => null)) as { id?: string } | null;
  if (response.status !== 201 || !uploaded?.id) back(here, problemCodes(uploaded));
  const { status, body } = await api(`/requests/${id}/consent/uploaded`, {
    method: "POST",
    body: JSON.stringify({ documentId: uploaded.id }),
  });
  if (status !== 200) back(here, problemCodes(body));
  redirect(`/richieste/${id}/riepilogo`);
}

// -------------------------------------------------------------- submission

export async function submitRequest(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const { status, body } = await api(`/requests/${id}/submit`, { method: "POST", body: "{}" });
  if (status !== 200) back(`${base}/${id}/riepilogo`, problemCodes(body));
  redirect(`${base}/${id}?inviata=1`);
}

export async function cancelRequest(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const { status, body } = await api(`/requests/${id}/cancel`, { method: "POST", body: "{}" });
  if (status !== 200) back(`${base}/${id}`, problemCodes(body));
  redirect(`${base}/${id}`);
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const id = requestId(formData.get("notificationId"));
  const link = text(formData, "link");
  await api(`/me/notifications/${id}/read`, { method: "POST", body: "{}" });
  redirect(link?.startsWith("/") && !link.startsWith("//") ? link : "/notifiche");
}

/** Search forms (customers, plates): the terms go in a server-only cookie, not in the URL. */
export async function search(formData: FormData): Promise<void> {
  const scope = text(formData, "scope");
  const targets: Record<SearchScope, string> = {
    clienti: "/clienti",
    "nuova-richiesta": "/richieste/nuova",
    richieste: "/richieste",
  };
  if (!scope || !(SEARCH_SCOPES as readonly string[]).includes(scope)) redirect("/");
  const typed = scope as SearchScope;
  await writeSearch(
    typed,
    typed === "richieste"
      ? { q: (text(formData, "q") ?? "").slice(0, 20), status: text(formData, "stato") ?? "" }
      : { q: (text(formData, "q") ?? "").slice(0, 40) },
  );
  // The page that follows is the same one: drop its cached version so it reads the new terms.
  revalidatePath(targets[typed]);
  redirect(targets[typed]);
}

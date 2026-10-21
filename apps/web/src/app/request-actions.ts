"use server";

import { SystemClock } from "@astax/adapters/clock";
import { romeCalendarDate } from "@astax/shared/format";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, sessionId, webAuth, browserClient } from "@/lib/auth";
import { requestOptions } from "@/lib/requests";
import { SEARCH_SCOPES, writeSearch, type SearchScope } from "@/lib/search";
import { checked, requestTermsFromForm, text } from "@/lib/wizard-forms";

/**
 * Server actions of the request wizards (private and broker). Every error
 * comes back as codes in the `errore` query parameter: field paths and issue
 * codes, never the values typed by the user (CLAUDE.md rule 8).
 */
const clock = new SystemClock();
const today = () => romeCalendarDate(clock.now());

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
  const join = path.includes("?") ? "&" : "?";
  redirect(`${path}${join}errore=${encodeURIComponent(codes)}`);
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
  const body = (await response.json().catch(() => null)) as { readable?: boolean } | null;
  return {
    ok: response.status === 201,
    codes: response.status === 201 ? "" : problemCodes(body),
    // ADR 0013: whether the photo can be read, said at once.
    readable: response.status !== 201 || body?.readable !== false,
  };
}

// -------------------------------------------------------------- creation

export async function createPrivateRequest(): Promise<void> {
  const { status, body } = await api<{ id: string }>("/requests", { method: "POST", body: "{}" });
  if (status !== 201) back("/preventivi", problemCodes(body));
  redirect(`/preventivi/${body.id}/tipo`);
}

export async function createBrokerRequest(formData: FormData): Promise<void> {
  const customerId = requestId(formData.get("customerId"));
  const { status, body } = await api<{ id: string }>("/requests", {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
  if (status !== 201) back("/richieste/nuova", problemCodes(body));
  redirect(`/richieste/${body.id}/tipo`);
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
    redirect(`/richieste/${created.body.id}/tipo`);
  }
  redirect(`/clienti/${body.id}`);
}

// -------------------------------------------------------------- step 1: vehicle and history

export async function uploadDocument(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  // The step may carry its query (the simplified request: «dati?stato=NEW»).
  const step = (text(formData, "step") ?? "dati").replace(/[^a-z?=A-Z_]/g, "");
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
  const join = target.includes("?") ? "&" : "?";
  redirect(result.readable ? target : `${target}${join}illeggibile=${encodeURIComponent(kind)}`);
}

// -------------------------------------------------------------- step 2: people and drivers

interface Municipality {
  istatCode: string;
  name: string;
  province: string;
}

// -------------------------------------------------------------- steps 3 and 4: coverage and auction

export async function saveCoverageStep(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const step = "copertura";
  const options = await requestOptions();
  const terms = requestTermsFromForm(formData, {
    auctionDurationHours: options.defaultAuctionDurationHours,
    minValidityDays: options.defaultMinValidityDays,
    today: today(),
  });
  const saved = await saveSection(id, "request", terms);
  if (!saved.ok) back(`${base}/${id}/${step}`, saved.codes);
  // From the coverages to the confirmation (Dan, 2026-10-21).
  redirect(`${base}/${id}/conferma`);
}

// -------------------------------------------------------------- consent

// -------------------------------------------------------------- the simplified request (ADR 0013)

/** The draft's essential data, to change one part of it. */
async function currentIntake(id: string): Promise<Record<string, unknown>> {
  const { body } = await api<{ draft: { intake?: Record<string, unknown> } | null }>(
    `/requests/${id}`,
  );
  return body.draft?.intake ?? {};
}

/** Screen 2: plate, owner's birth date, residence, and for a new vehicle the class. */
export async function saveIntakeStep(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const status = text(formData, "intake.vehicleStatus") === "NEW" ? "NEW" : "INSURED";
  const here = `${base}/${id}/dati?stato=${status}`;
  const name = text(formData, "intake.municipality") ?? "";
  const province = text(formData, "intake.province")?.toUpperCase();
  const candidates = name
    ? (await api<Municipality[]>(`/reference/municipalities?q=${encodeURIComponent(name)}`)).body
    : [];
  const municipality = candidates.find(
    (m) => m.name.toLowerCase() === name.toLowerCase() && (!province || m.province === province),
  );
  if (!municipality) back(here, "intake.municipality:MUNICIPALITY_NOT_FOUND");
  const previous = await currentIntake(id);
  const source = text(formData, "intake.classSource");
  const intake = {
    vehicleStatus: status,
    plate: text(formData, "intake.plate"),
    ownerBirthDate: text(formData, "intake.ownerBirthDate"),
    residence: {
      street: text(formData, "intake.street"),
      postalCode: text(formData, "intake.postalCode"),
      municipalityIstat: municipality.istatCode,
      province: municipality.province,
    },
    ...(previous.drivingFormula ? { drivingFormula: previous.drivingFormula } : {}),
    ...(status === "NEW"
      ? {
          classSource: {
            kind: source ?? "OWN_VEHICLE",
            ...(source !== "FIRST_POLICY" && text(formData, "intake.otherPlate")
              ? { plate: text(formData, "intake.otherPlate") }
              : {}),
            ...(source === "FAMILY" && text(formData, "intake.relativeBirthDate")
              ? { relativeBirthDate: text(formData, "intake.relativeBirthDate") }
              : {}),
          },
        }
      : {}),
  };
  const saved = await saveSection(id, "intake", intake);
  if (!saved.ok) back(here, saved.codes);
  redirect(`${base}/${id}/guida`);
}

/** Screen 3: the type of driving. */
export async function saveDrivingStep(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const formula = text(formData, "intake.drivingFormula");
  if (!formula) back(`${base}/${id}/guida`, "drivingFormula:REQUIRED");
  const saved = await saveSection(id, "intake", {
    ...(await currentIntake(id)),
    drivingFormula: formula,
  });
  if (!saved.ok) back(`${base}/${id}/guida`, saved.codes);
  redirect(`${base}/${id}/copertura`);
}

/** Screen 5: one tick for the consents (Dan, answer 5B), then the submission. */
export async function confirmAndSubmit(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const here = `${base}/${id}/conferma`;
  // The broker's customers are covered by its declaration (docs/piano-broker.md, answer 3).
  const broker = base === "/richieste";
  if (!broker && !checked(formData, "consent")) back(here, "consent:CONSENT_REQUIRED");
  // Once only: a second try after an error keeps the consent already given.
  const given = broker ? null : await api<{ consent: unknown }>(`/requests/${id}/consent`);
  if (given && !given.body.consent) {
    const accepted = await api(`/requests/${id}/consent/accept`, { method: "POST", body: "{}" });
    if (accepted.status !== 200) back(here, problemCodes(accepted.body));
  }
  const { status, body } = await api(`/requests/${id}/submit`, { method: "POST", body: "{}" });
  if (status !== 200) back(here, problemCodes(body));
  redirect(`${base}/${id}?inviata=1`);
}

// -------------------------------------------------------------- submission

export async function cancelRequest(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const { status, body } = await api(`/requests/${id}/cancel`, { method: "POST", body: "{}" });
  if (status !== 200) back(`${base}/${id}`, problemCodes(body));
  redirect(`${base}/${id}`);
}

/** GAR-06: the requester asks the same agencies to reconfirm their prices. */
export async function askReconfirmation(formData: FormData): Promise<void> {
  const id = requestId(formData.get("requestId"));
  const base = basePath(formData.get("base"));
  const { status, body } = await api(`/requests/${id}/reconfirmation`, {
    method: "POST",
    body: "{}",
  });
  if (status !== 200) back(`${base}/${id}`, problemCodes(body));
  redirect(`${base}/${id}?fatto=riconferma`);
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const id = requestId(formData.get("notificationId"));
  const link = text(formData, "link");
  await api(`/me/notifications/${id}/read`, { method: "POST", body: "{}" });
  redirect(link?.startsWith("/") && !link.startsWith("//") ? link : "/notifiche");
}

export async function markAllNotificationsRead(): Promise<void> {
  await api("/me/notifications/read-all", { method: "POST", body: "{}" });
  redirect("/notifiche");
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
      ? {
          q: (text(formData, "q") ?? "").slice(0, 20),
          status: text(formData, "stato") ?? "",
          customer: (text(formData, "cliente") ?? "").slice(0, 60),
          days: text(formData, "giorni") ?? "",
        }
      : { q: (text(formData, "q") ?? "").slice(0, 40) },
  );
  // The page that follows is the same one: drop its cached version so it reads the new terms.
  revalidatePath(targets[typed]);
  redirect(targets[typed]);
}

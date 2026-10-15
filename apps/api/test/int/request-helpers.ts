import { sampleQuoteData, type QuoteData } from "@astax/shared/domain";
import { expect } from "vitest";
import type { Harness } from "./fixtures.js";

/** Helpers to build requests over HTTP in the integration tests (fase 2). */
export type Who = { token: string; context?: string };

export function requestHelpers(h: Harness) {
  const call = (who: Who, path: string, options: { method?: string; body?: unknown } = {}) =>
    h.call(path, { ...who, ...options });

  async function json<T>(response: Response, status: number): Promise<T> {
    const text = await response.text();
    expect(response.status, text).toBe(status);
    return (text ? JSON.parse(text) : null) as T;
  }

  function upload(
    who: Who,
    requestId: string,
    kind: string,
    fileName: string,
    driverIndex?: number,
  ) {
    const query = `kind=${kind}${driverIndex === undefined ? "" : `&driverIndex=${driverIndex}`}`;
    return fetch(`${h.baseUrl}/requests/${requestId}/documents?${query}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${who.token}`,
        ...(who.context ? { "x-astax-context": who.context } : {}),
        "content-type": fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        "x-file-name": encodeURIComponent(fileName),
      },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
    });
  }

  /** The sample request, with the vehicle as the fake plate lookup describes it. */
  async function sampleQuote(who: Who, plate = "GN123AB"): Promise<QuoteData> {
    const quote = sampleQuoteData();
    const lookup = await json<{
      vehicle: { make: string; model: string; firstRegistrationDate: string };
    }>(await call(who, "/vehicle-data/lookup", { body: { plate } }), 200);
    return {
      ...quote,
      vehicle: {
        ...quote.vehicle,
        plate,
        make: lookup.vehicle.make,
        model: lookup.vehicle.model,
        firstRegistrationDate: lookup.vehicle.firstRegistrationDate,
        purchaseDate: lookup.vehicle.firstRegistrationDate,
      },
    };
  }

  async function saveAll(who: Who, id: string, quote: QuoteData) {
    const sections: [string, unknown][] = [
      ["policyHolder", quote.policyHolder],
      ["vehicleOwner", quote.vehicleOwner],
      ["vehicle", quote.vehicle],
      ["history", quote.history],
      ["driving", { drivers: quote.drivers, drivingFormula: quote.drivingFormula }],
      ["request", quote.request],
    ];
    for (const [section, value] of sections) {
      await json(
        await call(who, `/requests/${id}/draft/${section}`, { method: "PUT", body: { value } }),
        200,
      );
    }
  }

  function lastCode(to: string): string {
    const message = [...h.email.sent].reverse().find((m) => m.to === to);
    const code = /\b(\d{6})\b/.exec(message?.text ?? "")?.[1];
    if (!code) throw new Error(`no code sent to ${to}`);
    return code;
  }

  /** A private user's request with the sample documents and consent, submitted. */
  async function submittedPrivateRequest(who: Who, email: string) {
    const created = await json<{ id: string; code: string }>(
      await call(who, "/requests", { body: {} }),
      201,
    );
    const quote = await sampleQuote(who);
    await saveAll(who, created.id, quote);
    await json(
      await upload(who, created.id, "REGISTRATION_CERTIFICATE", "libretto-giulia-neri.jpg"),
      201,
    );
    await json(await upload(who, created.id, "DRIVING_LICENCE", "patente-giulia-neri.jpg", 0), 201);
    await json(await upload(who, created.id, "RISK_CERTIFICATE", "attestato-giulia-neri.pdf"), 201);
    await json(await call(who, `/requests/${created.id}/consent/code`, { body: {} }), 204);
    await json(
      await call(who, `/requests/${created.id}/consent/confirm`, {
        body: { code: lastCode(email) },
      }),
      200,
    );
    const submitted = await json<{ autoOutcome: string }>(
      await call(who, `/requests/${created.id}/submit`, { body: {} }),
      200,
    );
    return { ...created, quote, autoOutcome: submitted.autoOutcome };
  }

  return { call, json, upload, sampleQuote, saveAll, lastCode, submittedPrivateRequest };
}

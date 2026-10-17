import { describe, expect, it } from "vitest";
import { ManualClock } from "../clock/manual-clock.js";
import { FakePlateLookup } from "../vehicle-data/plate-lookup.js";
import { EXTRACTABLE_DOCUMENTS, FakeDocumentReader } from "./document-reader.js";

const clock = new ManualClock("2026-10-15T08:00:00Z");
const plates = new FakePlateLookup(clock);
const reader = new FakeDocumentReader(clock, plates);
const file = (fileName: string) => ({ key: "doc/1", fileName, contentType: "image/jpeg" });

describe("fake document reader", () => {
  it("chooses the fixture from the file name", async () => {
    const result = await reader.extract({
      kind: "DRIVING_LICENCE",
      files: [file("patente-giulia-neri.jpg")],
    });
    expect(result.fields.surname).toEqual({ value: "Neri", confidence: 0.97 });
    expect(result).toMatchObject({
      model: "fake-document-reader",
      promptVersion: "fake-1",
      warnings: [],
    });
  });

  it("falls back to the default fixture", async () => {
    const result = await reader.extract({ kind: "DRIVING_LICENCE", files: [file("scan001.jpg")] });
    expect(result.fields.surname?.value).toBe("Prova");
  });

  it("a file name with low-confidence gives confidence 0.6 to every field", async () => {
    const result = await reader.extract({
      kind: "DRIVING_LICENCE",
      files: [file("patente-giulia-neri-low-confidence.jpg")],
    });
    expect(Object.values(result.fields).every((f) => f.confidence === 0.6)).toBe(true);
    expect(result.fields.surname?.value).toBe("Neri");
  });

  it("the registration certificate agrees with the plate lookup", async () => {
    const result = await reader.extract({
      kind: "REGISTRATION_CERTIFICATE",
      files: [file("libretto-giulia-neri.jpg")],
    });
    const vehicle = await plates.lookup({ plate: "GN123AB" });
    if (!vehicle.found) throw new Error("expected a vehicle");
    expect(result.fields.make?.value).toBe(vehicle.vehicle.make);
    expect(result.fields.firstRegistrationDate?.value).toBe(vehicle.vehicle.firstRegistrationDate);
    expect(result.fields.ownerFiscalCode?.value).toBe("NREGLI90E52F205X");
  });

  it("relative dates in fixtures follow the clock", async () => {
    const result = await reader.extract({
      kind: "RISK_CERTIFICATE",
      files: [file("attestato-giulia-neri.pdf")],
    });
    expect(result.fields.expiryDate?.value).toBe("2026-11-14");
  });

  it("every kind has a default fixture, and only synthetic people", async () => {
    for (const kind of EXTRACTABLE_DOCUMENTS) {
      const result = await reader.extract({ kind, files: [file("x.pdf")] });
      expect(Object.keys(result.fields).length, kind).toBeGreaterThan(0);
      for (const name of reader.fixtureNames(kind)) {
        await expect(reader.extract({ kind, files: [file(`${name}.pdf`)] })).resolves.toBeTruthy();
      }
    }
  });
});

describe("fake reader of the quote PDF (OFF-09, proposal E)", () => {
  const files: Record<string, string> = {
    "q/1": "%PDF-1.7\nPreventivo di prova\nCompagnia: Compagnia Alfa\nPremio: 1.505,00\n",
    "q/2": "%PDF-1.7\nPreventivo senza righe\n",
  };
  const quotes = new FakeDocumentReader(clock, plates, undefined, async (key) =>
    new TextEncoder().encode(files[key] ?? ""),
  );
  const quote = (key: string) => ({
    key,
    fileName: "preventivo.pdf",
    contentType: "application/pdf",
  });

  it("OFF-09 reads premium (whole cents) and company from the PDF text", async () => {
    const result = await quotes.extract({ kind: "QUOTE_PDF", files: [quote("q/1")] });
    expect(result.fields.annualGrossPremiumCents?.value).toBe(150500);
    expect(result.fields.companyName?.value).toBe("Compagnia Alfa");
    expect(result.warnings).toEqual([]);
  });

  it("OFF-09 a PDF without the lines gives no field and NOT_FOUND", async () => {
    const result = await quotes.extract({ kind: "QUOTE_PDF", files: [quote("q/2")] });
    expect(result.fields).toEqual({});
    expect(result.warnings).toEqual(["NOT_FOUND"]);
  });
});

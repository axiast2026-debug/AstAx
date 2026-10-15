import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createLogger,
  errorForLog,
  isSensitiveKey,
  redact,
  REDACTED,
  scrubString,
} from "./index.js";

// Synthetic data only (SIC-08).
const FISCAL_CODE = "RSSMRA80A01H501U";
const EMAIL = "giulia.neri@example.com";
const PHONE = "+39 333 1234567";
const IBAN = "IT60X0542811101000000123456";
const IBAN_SPACED = "IT60 X054 2811 1010 0000 0123 456";
const SENSITIVE = [
  FISCAL_CODE,
  EMAIL,
  "333 1234567",
  "1234567",
  IBAN,
  IBAN_SPACED,
  "52000",
  "Rossi",
];

function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger({ name: "test", destination }), lines };
}

describe("SIC-06 the logger hides personal data and offer prices", () => {
  it("blanks sensitive fields whatever their content", () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        requestId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
        customer: { fiscalCode: FISCAL_CODE, email: EMAIL, phone: PHONE, lastName: "Rossi" },
        organization: { iban: IBAN, ibanEnc: "v1:abc", emailHash: "f00d" },
        offer: { annualGrossPremiumCents: 52000, companyId: "c-1" },
      },
      "offer stored",
    );
    const output = lines.join("");
    for (const value of SENSITIVE) expect(output).not.toContain(value);
    expect(output).toContain("0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b");
    expect(output).toContain("c-1");
    expect(output).toContain(REDACTED);
  });

  it("scrubs data hidden inside free text and messages", () => {
    const { logger, lines } = captureLogger();
    logger.warn(
      { detail: `customer ${EMAIL} wrote from ${PHONE}, CF ${FISCAL_CODE}, IBAN ${IBAN_SPACED}` },
      `lookup failed for ${EMAIL} / ${FISCAL_CODE}`,
    );
    const output = lines.join("");
    for (const value of [EMAIL, FISCAL_CODE, "333 1234567", IBAN_SPACED])
      expect(output).not.toContain(value);
    expect(output).toContain("lookup failed for");
  });

  it("scrubs errors, their message, stack and extra fields", () => {
    const { logger, lines } = captureLogger();
    const error = Object.assign(new Error(`duplicate fiscal code ${FISCAL_CODE}`), {
      email: EMAIL,
    });
    logger.error({ err: error }, "insert failed");
    const output = lines.join("");
    expect(output).not.toContain(FISCAL_CODE);
    expect(output).not.toContain(EMAIL);
    expect(output).toContain("duplicate fiscal code");
  });

  it("keeps identifiers, dates and plain codes", () => {
    expect(scrubString("AX-2026-000123 closed at 2026-11-16T11:00:00.000Z")).toBe(
      "AX-2026-000123 closed at 2026-11-16T11:00:00.000Z",
    );
    expect(scrubString("0199a1b2-c3d4-7e5f-8a9b-012345678901")).toBe(
      "0199a1b2-c3d4-7e5f-8a9b-012345678901",
    );
  });

  it("recognises sensitive keys in any naming style", () => {
    for (const key of [
      "fiscal_code",
      "FiscalCode",
      "phone-number",
      "IBAN",
      "premiumCents",
      "feeCents",
      "fiscalCodeEnc",
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
    for (const key of ["requestId", "status", "auctionId", "hash", "createdAt"])
      expect(isSensitiveKey(key)).toBe(false);
  });

  it("survives circular structures", () => {
    const node: Record<string, unknown> = { id: "x" };
    node.self = node;
    expect(redact(node)).toEqual({ id: "x", self: "[Circular]" });
  });
});

describe("errors in the log", () => {
  it("rule 8: a database error is logged without its message, which repeats the query values", () => {
    class PrismaClientValidationError extends Error {
      override name = "PrismaClientValidationError";
    }
    const error = new PrismaClientValidationError('Invalid create: fiscalCode: "NREGLI90E52F205X"');
    const logged = errorForLog(error);
    expect(logged.type).toBe("PrismaClientValidationError");
    expect(JSON.stringify(logged)).not.toContain("NREGLI90E52F205X");
  });

  it("other errors keep their message", () => {
    expect(errorForLog(new TypeError("x is not a function"))).toMatchObject({
      type: "TypeError",
      message: "x is not a function",
    });
  });
});

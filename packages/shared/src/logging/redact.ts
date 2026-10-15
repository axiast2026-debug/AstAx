/**
 * Removes personal data, offer prices and secrets from anything about to be
 * logged or sent to error tracking (SIC-06, BC-07, CLAUDE.md rule 8).
 * Two barriers: sensitive field names are blanked whatever their value, and
 * every remaining string is scanned for emails, fiscal codes, IBANs and phones.
 */
export const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set(
  [
    "fiscalCode",
    "codiceFiscale",
    "taxCode",
    "vatNumber",
    "partitaIva",
    "email",
    "mail",
    "phone",
    "phoneNumber",
    "mobile",
    "telefono",
    "iban",
    "firstName",
    "lastName",
    "fullName",
    "birthDate",
    "birthPlace",
    "address",
    "residence",
    "plate",
    "licenceNumber",
    "password",
    "secret",
    "token",
    "accessToken",
    "refreshToken",
    "idToken",
    "authorization",
    "cookie",
    "setCookie",
    "otp",
    "otpCode",
    "quoteData",
    "sealedPayload",
    "ownerCopy",
    "coverage",
    "notes",
    "ip",
    "userAgent",
  ].map(normalizeKey),
);

/** Field-name endings that always hide the value: ciphertexts, blind indexes, money. */
const SENSITIVE_SUFFIXES = ["enc", "hash", "cents", "eur"];
const SENSITIVE_PARTS = ["premium", "password", "secret", "token", "fiscalcode", "iban"];

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_SUFFIXES.some((suffix) => normalized.endsWith(suffix) && normalized !== suffix) ||
    SENSITIVE_PARTS.some((part) => normalized.includes(part))
  );
}

const PATTERNS: RegExp[] = [
  // Email
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  // Italian fiscal code of a person (omocodia letters included)
  /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi,
  // IBAN, with or without spaces every four characters
  /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
  // Italian phone numbers: mobile and landline, with optional +39 / 0039
  /(?<![\w-])(?:(?:\+|00)39[\s.-]?)?(?:3\d{2}|0\d{1,3})[\s.-]?\d{3}[\s.-]?\d{3,5}(?![\w-])/g,
];

export function scrubString(value: string): string {
  return PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
}

const MAX_DEPTH = 8;

export function redact(value: unknown): unknown {
  return redactInner(value, 0, new WeakSet());
}

function redactInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[Truncated]";
  seen.add(value);

  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => redactInner(item, depth + 1, seen));
  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      type: value.name,
      message: scrubString(value.message),
      stack: value.stack === undefined ? undefined : scrubString(value.stack),
    };
    for (const [key, item] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactInner(item, depth + 1, seen);
    }
    return out;
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactInner(item, depth + 1, seen);
  }
  return out;
}

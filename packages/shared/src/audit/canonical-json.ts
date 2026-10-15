/**
 * Deterministic JSON: object keys sorted, undefined dropped, dates as ISO strings.
 * The same content always gives the same bytes, so its hash can be checked later.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("canonicalJson: invalid date");
    return value.toISOString();
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
      return value;
    case "bigint":
      return value.toString();
    case "object": {
      if (Array.isArray(value)) {
        return value.map((item: unknown) => (item === undefined ? null : normalize(item)));
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value).sort()) {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) out[key] = normalize(item);
      }
      return out;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

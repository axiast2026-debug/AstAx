/**
 * A unique index refused the row (PostgreSQL 23505). Prisma reports it as P2002
 * for the indexes it knows; for the partial indexes written in the migrations
 * (one active claim per person, for example) it comes from the driver adapter.
 */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as {
    code?: unknown;
    meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } };
    cause?: { originalCode?: unknown; kind?: unknown };
  } | null;
  if (!e) return false;
  if (e.code === "P2002" || e.code === "23505") return true;
  const cause = e.meta?.driverAdapterError?.cause ?? e.cause;
  return cause?.originalCode === "23505" || cause?.kind === "UniqueConstraintViolation";
}

/** The file starts as a PDF does («%PDF-»), whatever its declared type says. */
export function looksLikePdf(body: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(body.subarray(0, 1024));
  return head.trimStart().startsWith("%PDF-");
}

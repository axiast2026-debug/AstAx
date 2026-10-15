/**
 * An error as it may be logged (CLAUDE.md rule 8). Database client errors
 * repeat the whole query in their message, values included (names, fiscal
 * codes, encrypted fields): for them only the type, the code and the stack
 * frames are kept, never the message.
 */
export interface LoggableError {
  type: string;
  code?: string;
  message?: string;
  stack?: string;
}

function framesOnly(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .join("\n");
}

export function errorForLog(error: unknown): LoggableError {
  if (!(error instanceof Error)) return { type: typeof error };
  const code = (error as { code?: unknown }).code;
  const base: LoggableError = {
    type: error.name,
    ...(typeof code === "string" ? { code } : {}),
    ...(framesOnly(error.stack) ? { stack: framesOnly(error.stack) } : {}),
  };
  const fromDatabase = error.name.startsWith("Prisma") || error.name === "DatabaseError";
  return fromDatabase ? base : { ...base, message: error.message };
}

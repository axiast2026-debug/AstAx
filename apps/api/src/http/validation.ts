import type { z } from "zod";
import { ProblemError } from "./problem.js";

/** Validates input with the shared Zod schema; errors carry paths and codes, never values. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw ProblemError.fromZod(result.error);
  return result.data;
}

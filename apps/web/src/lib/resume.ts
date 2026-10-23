import type { QuoteDraft } from "@astax/shared/domain";

/** The wizard steps in order (apps/web/src/lib/requests.ts, PRIVATE_STEPS). */
export type ResumeStep = "tipo" | "dati" | "guida" | "copertura" | "conferma";

/**
 * Where a draft resumes (UX review 2026-10-23: «ripresa da dove si era
 * rimasti»): the first screen whose data is still missing. The vehicle type
 * and the essential data come together on «dati»; the type of driving has
 * its own screen; then the coverage; with everything saved, the confirmation.
 */
export function resumeStep(draft: QuoteDraft | null | undefined): ResumeStep {
  const intake = (draft?.intake ?? null) as { drivingFormula?: string; plate?: string } | null;
  if (!intake || !intake.plate) return "tipo";
  if (!intake.drivingFormula) return "guida";
  if (!draft?.request) return "copertura";
  return "conferma";
}

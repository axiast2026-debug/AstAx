const ON = /^(1|true|yes|on)$/i;

/**
 * Every port with a provider (docs/adattatori.md). The release needs each one
 * named and real: a missing variable means the fake (the default), so it
 * stops the release as an explicit «fake» does.
 */
export const REQUIRED_PROVIDERS = [
  "EMAIL_PROVIDER",
  "SMS_PROVIDER",
  "PUSH_PROVIDER",
  "KMS_PROVIDER",
  "AI_PROVIDER",
  "PLATE_PROVIDER",
  "ANIA_PROVIDER",
  "SDI_PROVIDER",
  "STORAGE_PROVIDER",
  "SIGNATURE_PROVIDER",
  "PAYMENTS_PROVIDER",
  "RUI_PROVIDER",
] as const;

/**
 * Phase 8: what stops a production release (criteria of fase 8; CLAUDE.md
 * rules 9, 10 and 13). The configuration must say production, keep the
 * development tools off and use no fake provider; the legal texts in force
 * are checked by legal:check against the production database.
 */
export function configurationBlockers(env: Record<string, string | undefined>): string[] {
  const blockers: string[] = [];
  if (env.NODE_ENV !== "production") {
    blockers.push(`NODE_ENV is "${env.NODE_ENV ?? ""}", not production`);
  }
  if (ON.test(env.DEV_TOOLS ?? "")) blockers.push("DEV_TOOLS is on (rule 13)");
  for (const key of REQUIRED_PROVIDERS) {
    const value = env[key]?.toLowerCase();
    if (!value || value === "fake") blockers.push(`${key} is the fake provider (rule 9)`);
  }
  return blockers;
}

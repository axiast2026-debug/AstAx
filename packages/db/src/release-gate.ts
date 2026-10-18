const ON = /^(1|true|yes|on)$/i;

/**
 * Phase 8: what stops a production release (criteria of fase 8; CLAUDE.md
 * rules 9, 10 and 13). The configuration must say production, keep the
 * development tools off and use no fake provider; the legal texts in force
 * are checked by `legalBlockers` against the production database.
 */
export function configurationBlockers(env: Record<string, string | undefined>): string[] {
  const blockers: string[] = [];
  if (env.NODE_ENV !== "production") {
    blockers.push(`NODE_ENV is "${env.NODE_ENV ?? ""}", not production`);
  }
  if (ON.test(env.DEV_TOOLS ?? "")) blockers.push("DEV_TOOLS is on (rule 13)");
  for (const [key, value] of Object.entries(env)) {
    if (key.endsWith("_PROVIDER") && value?.toLowerCase() === "fake") {
      blockers.push(`${key} is the fake provider (rule 9)`);
    }
  }
  return blockers;
}

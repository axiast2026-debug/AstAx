/**
 * Insurance companies of the fakes and of the seed (rule 11, ADR 0028).
 * Development and tests use the invented ones; the demo, with
 * DEMO_COMPANIES=true, the real ones of seed/compagnie-demo.json instead.
 */
export const INVENTED_COMPANY_NAMES = [
  "Compagnia Alfa",
  "Compagnia Beta",
  "Compagnia Gamma",
  "Compagnia Delta",
] as const;

/** The names of seed/compagnie-demo.json, in the same order (checked by the seed test). */
export const DEMO_COMPANY_NAMES = [
  "Unipol Assicurazioni",
  "Generali Italia",
  "Cattolica Assicurazioni",
  "Allianz",
  "AXA Assicurazioni",
  "Reale Mutua Assicurazioni",
  "Italiana Assicurazioni",
  "Zurich",
  "Vittoria Assicurazioni",
  "Groupama Assicurazioni",
  "Sara Assicurazioni",
  "Helvetia",
  "ITAS Mutua",
  "Tua Assicurazioni",
  "HDI Assicurazioni",
  "Nobis Assicurazioni",
  "Assimoco",
  "Bene Assicurazioni",
  "Prima Assicurazioni",
  "Verti",
  "Euroherc",
  "Adriatic Assicurazioni",
] as const;

/** The real company that takes the place of each invented one in the demo. */
export const DEMO_REPLACEMENT: Record<(typeof INVENTED_COMPANY_NAMES)[number], string> = {
  "Compagnia Alfa": "Unipol Assicurazioni",
  "Compagnia Beta": "Generali Italia",
  "Compagnia Gamma": "Allianz",
  "Compagnia Delta": "AXA Assicurazioni",
};

/** DEMO_COMPANIES=true turns the real companies on; anything else keeps the invented ones. */
export function demoCompaniesEnabled(value: string | undefined): boolean {
  return value === "true";
}

/** The company names a fake adapter chooses from. */
export function fakeCompanyNames(demo: boolean): readonly string[] {
  return demo ? DEMO_COMPANY_NAMES : INVENTED_COMPANY_NAMES;
}

/** In the demo an invented name becomes its real replacement; any other name is left alone. */
export function demoCompanyName(name: string, demo: boolean): string {
  if (!demo) return name;
  return DEMO_REPLACEMENT[name as keyof typeof DEMO_REPLACEMENT] ?? name;
}

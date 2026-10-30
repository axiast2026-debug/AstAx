import { describe, expect, it } from "vitest";
import {
  DEMO_COMPANY_NAMES,
  demoCompaniesEnabled,
  demoCompanyName,
  fakeCompanyNames,
  INVENTED_COMPANY_NAMES,
} from "./demo-companies.js";

describe("ADR 0028: companies of the fakes (rule 11)", () => {
  it("invented companies unless DEMO_COMPANIES=true", () => {
    expect(demoCompaniesEnabled(undefined)).toBe(false);
    expect(demoCompaniesEnabled("false")).toBe(false);
    expect(demoCompaniesEnabled("true")).toBe(true);
    expect(fakeCompanyNames(false)).toEqual(INVENTED_COMPANY_NAMES);
    expect(fakeCompanyNames(true)).toEqual(DEMO_COMPANY_NAMES);
  });

  it("in the demo an invented name becomes a real one; other names stay", () => {
    expect(demoCompanyName("Compagnia Alfa", true)).toBe("Unipol Assicurazioni");
    expect(demoCompanyName("Compagnia Alfa", false)).toBe("Compagnia Alfa");
    expect(demoCompanyName("Zurich", true)).toBe("Zurich");
    for (const invented of INVENTED_COMPANY_NAMES) {
      expect(DEMO_COMPANY_NAMES).toContain(demoCompanyName(invented, true));
    }
  });
});

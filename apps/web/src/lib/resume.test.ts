import type { QuoteDraft } from "@astax/shared/domain";
import { describe, expect, it } from "vitest";
import { resumeStep } from "./resume";

const intake = {
  vehicleStatus: "INSURED",
  plate: "GN123AB",
  ownerBirthDate: "1990-05-12",
  residence: {
    street: "Via delle Prove 1",
    postalCode: "20121",
    municipalityIstat: "015146",
    province: "MI",
  },
};

describe("resumeStep", () => {
  it("an empty draft starts from the vehicle type", () => {
    expect(resumeStep(null)).toBe("tipo");
    expect(resumeStep({})).toBe("tipo");
  });

  it("with the essential data saved the next screen is the type of driving", () => {
    expect(resumeStep({ intake } as QuoteDraft)).toBe("guida");
  });

  it("with the driving chosen the next screen is the coverage", () => {
    expect(resumeStep({ intake: { ...intake, drivingFormula: "FREE" } } as QuoteDraft)).toBe(
      "copertura",
    );
  });

  it("with the coverage saved only the confirmation is left", () => {
    expect(
      resumeStep({
        intake: { ...intake, drivingFormula: "FREE" },
        request: { packageCode: "RECOMMENDED" },
      } as unknown as QuoteDraft),
    ).toBe("conferma");
  });
});

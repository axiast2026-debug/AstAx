import { describe, expect, it } from "vitest";
import { isItalianPlate, normalizePlate, plateFitsVehicleType, plateKinds } from "./plates.js";

describe("Italian plates", () => {
  it("recognises car plates and ignores spaces, dashes and case", () => {
    expect(normalizePlate(" ab 123-cd ")).toBe("AB123CD");
    expect(plateKinds("AB 123 CD")).toEqual(["CAR"]);
  });

  it("never uses I, O, Q and U on car and motorcycle plates", () => {
    expect(plateKinds("AI123CD")).not.toContain("CAR");
    expect(plateKinds("AB123CO")).not.toContain("CAR");
    expect(plateKinds("QU12345")).not.toContain("MOTORCYCLE");
  });

  it("recognises motorcycle and moped plates", () => {
    expect(plateKinds("AB12345")).toEqual(["MOTORCYCLE"]);
    expect(plateKinds("X2B4CD")).toEqual(["MOPED"]);
  });

  it("ASTA-10 treats any other shape as a foreign or temporary plate", () => {
    expect(isItalianPlate("B-AB-1234")).toBe(false);
    expect(isItalianPlate("EE123AA0")).toBe(false);
    expect(isItalianPlate("ABCDEF")).toBe(false);
  });

  it("checks the plate against the vehicle type", () => {
    expect(plateFitsVehicleType("AB123CD", "CAR")).toBe(true);
    expect(plateFitsVehicleType("AB123CD", "MOTORCYCLE")).toBe(false);
    expect(plateFitsVehicleType("AB12345", "MOTORCYCLE")).toBe(true);
    expect(plateFitsVehicleType("AB123CD", "CAMPER")).toBe(false);
  });
});

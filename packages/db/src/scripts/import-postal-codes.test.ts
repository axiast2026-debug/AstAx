import { describe, expect, it } from "vitest";
import { postalCodesCsv, postalCodesFromGeoNames } from "./import-postal-codes.js";

const geo = [
  "IT\t11100\tAosta\tValle d'Aosta\t02\tAosta\tAO\t\t\t45.7\t7.3\t4",
  "IT\t00118\tRoma\tLazio\t07\tRoma\tRM\t\t\t41.9\t12.5\t4",
  "IT\t00119\tRoma\tLazio\t07\tRoma\tRM\t\t\t41.9\t12.5\t4",
  "IT\t00119\tRoma\tLazio\t07\tRoma\tRM\t\t\t41.9\t12.5\t4",
  "IT\t39100\tBolzano/Bozen\tTrentino\t17\tBolzano\tBZ\t\t\t46.5\t11.3\t4",
  "IT\t20010\tMilano\tLombardia\t09\tPavia\tPV\t\t\t45.0\t9.0\t4",
].join("\n");

describe("CAP of the municipalities (Dan, 2026-10-28)", () => {
  const municipalities = [
    { istatCode: "007003", province: "AO", name: "Aosta" },
    { istatCode: "058091", province: "RM", name: "Roma" },
    { istatCode: "021008", province: "BZ", name: "Bolzano/Bozen" },
    { istatCode: "015146", province: "MI", name: "Milano" },
    { istatCode: "001999", province: "TO", name: "Valchiusa" },
  ];
  const codes = postalCodesFromGeoNames(geo, municipalities);

  it("one CAP, several CAPs without repeats, bilingual names", () => {
    expect(codes.get("007003")).toEqual(["11100"]);
    expect(codes.get("058091")).toEqual(["00118", "00119"]);
    expect(codes.get("021008")).toEqual(["39100"]);
  });

  it("a place with the same name in another province does not count; unknown stays out", () => {
    expect(codes.has("015146")).toBe(false);
    expect(codes.has("001999")).toBe(false);
  });

  it("the CSV is sorted and stable", () => {
    expect(postalCodesCsv(codes)).toBe(
      "istat;cap\n007003;11100\n021008;39100\n058091;00118|00119\n",
    );
  });
});

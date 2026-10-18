import { describe, expect, it } from "vitest";
import { FakeRuiRegistry, parseRuiCsv } from "./rui-registry.js";

describe("RUI registry (fake)", () => {
  it("reads the invented intermediaries with their companies and links", async () => {
    const records = [];
    for await (const r of await new FakeRuiRegistry().downloadLatest()) records.push(r);
    expect(records.find((r) => r.number === "A000000101")).toEqual({
      number: "A000000101",
      section: "A",
      name: "Agenzia Undici",
      companies: ["Compagnia Alfa", "Compagnia Gamma"],
    });
    expect(records.find((r) => r.number === "E000000001")?.linkedNumber).toBe("A000000001");
  });

  it("refuses a file in another format", () => {
    expect(() => parseRuiCsv("a;b\n1;2")).toThrow(/header/);
    expect(() => parseRuiCsv("number;section;name;linked;companies\nX1;Z;Nome;;")).toThrow(
      /section/,
    );
  });
});

import { describe, expect, it } from "vitest";
import { FakeAniaReader } from "../ania/ania-reader.js";
import { ManualClock } from "../clock/manual-clock.js";
import { FakeDocumentReader } from "../document-reader/document-reader.js";
import { FakeRuiRegistry } from "../rui-registry/rui-registry.js";
import { FakePlateLookup } from "../vehicle-data/plate-lookup.js";

// ADR 0028: in the demo the fakes name real companies; elsewhere invented ones (rule 11).
const clock = new ManualClock("2026-10-30T08:00:00Z");
const REAL = ["Unipol Assicurazioni", "Generali Italia", "Allianz"];
const rename = (name: string) => (name === "Compagnia Alfa" ? "Unipol Assicurazioni" : name);
const plates = ["GN123AB", "AB123CD", "FX987ZZ", "EP111AA", "CC222DD", "KK333LL"];

describe("ADR 0028: companies of the fakes in the demo", () => {
  it("plate lookup and ANIA choose from the list they are given, and agree", async () => {
    const lookup = new FakePlateLookup(clock, REAL);
    const ania = new FakeAniaReader(clock, REAL);
    for (const plate of plates) {
      const found = await lookup.lookup({ plate });
      if (!found.found) throw new Error("not found");
      expect(REAL).toContain(found.insurance?.companyName);
      const read = await ania.read({ requestId: "r", operatorId: "o", plate });
      if (!read.found) throw new Error("not found");
      expect(read.record.latestCover?.company?.name).toBe(
        found.insurance?.companyName?.toUpperCase(),
      );
    }
  });

  it("without a list they keep the invented companies", async () => {
    const found = await new FakePlateLookup(clock).lookup({ plate: "GN123AB" });
    if (!found.found) throw new Error("not found");
    expect(found.insurance?.companyName).toMatch(/^Compagnia /);
  });

  it("the RUI registry and the document reader rename the invented companies", async () => {
    const records = [];
    for await (const r of await new FakeRuiRegistry(undefined, rename).downloadLatest())
      records.push(r);
    expect(records.find((r) => r.number === "A000000001")?.companies).toEqual([
      "Unipol Assicurazioni",
      "Compagnia Beta",
    ]);
    const reader = new FakeDocumentReader(clock, undefined, undefined, undefined, rename);
    const result = await reader.extract({
      kind: "RISK_CERTIFICATE",
      files: [{ key: "k", fileName: "attestato-giulia-neri.pdf", contentType: "application/pdf" }],
    });
    expect(result.fields.currentInsurer?.value).toBe("Unipol Assicurazioni");
  });
});

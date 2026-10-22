import { describe, expect, it } from "vitest";
import { guaranteeState } from "./guarantee";

describe("the guaranteed price on the offers (Momento 4)", () => {
  it("GAR-02 GAR-05 ok, then orange from the reminder day, then the last day", () => {
    expect(guaranteeState({ block: null, daysLeft: 20 }, 2)).toBe("ok");
    expect(guaranteeState({ block: null, daysLeft: 3 }, 2)).toBe("ok");
    expect(guaranteeState({ block: null, daysLeft: 2 }, 2)).toBe("expiring");
    expect(guaranteeState({ block: null, daysLeft: 1 }, 2)).toBe("expiring");
    expect(guaranteeState({ block: null, daysLeft: 0 }, 2)).toBe("lastDay");
  });

  it("GAR-05 follows the reminder days of the round", () => {
    expect(guaranteeState({ block: null, daysLeft: 3 }, 3)).toBe("expiring");
  });

  it("GAR-04 an expired offer is grey; one too late to issue keeps its date", () => {
    expect(guaranteeState({ block: "EXPIRED", daysLeft: 0 }, 2)).toBe("expired");
    expect(guaranteeState({ block: "TOO_LATE", daysLeft: 5 }, 2)).toBe("ok");
  });
});

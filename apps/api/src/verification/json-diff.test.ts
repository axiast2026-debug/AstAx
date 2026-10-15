import { describe, expect, it } from "vitest";
import { changedPaths } from "./json-diff.js";

describe("changed paths of a correction", () => {
  it("lists the leaves that changed, added or removed", () => {
    expect(
      changedPaths(
        { vehicle: { make: "A", model: "B" }, drivers: [{ n: 1 }], x: 1 },
        { vehicle: { make: "C", model: "B" }, drivers: [{ n: 1 }, { n: 2 }], y: 2 },
      ),
    ).toEqual(["drivers.1", "vehicle.make", "x", "y"]);
  });

  it("is empty for equal values", () => {
    expect(changedPaths({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toEqual([]);
  });
});

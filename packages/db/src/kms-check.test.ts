import { describe, expect, it } from "vitest";
import { keyAnomalies } from "./kms-check.js";

// BC-03, phase 8: who may decrypt the sealed bids, and when.
const at = (iso: string) => new Date(iso);
const auctions = new Map([
  ["a1", { scheduledCloseAt: at("2031-03-03T11:00:00Z"), closedAt: null }],
  // Closed earlier than scheduled (the last invited agency declined): its closing counts.
  ["a2", { scheduledCloseAt: at("2031-03-03T12:00:00Z"), closedAt: at("2031-03-03T10:30:00Z") }],
]);
const event = (over: Partial<Parameters<typeof keyAnomalies>[0][number]>) => ({
  at: at("2031-03-03T11:00:01Z"),
  key: "astax-sealed-bids",
  auctionId: "a1",
  principal: "worker",
  ok: true,
  ...over,
});

describe("BC-03 the nightly check of the sealed bids' key", () => {
  it("a decryption by the worker at the closing is in rule", () => {
    expect(keyAnomalies([event({})], auctions, ["worker"])).toEqual([]);
    expect(
      keyAnomalies([event({ auctionId: "a2", at: at("2031-03-03T10:30:02Z") })], auctions, [
        "worker",
      ]),
    ).toEqual([]);
  });

  it("before the closing, by another process, without or with an unknown auction: anomalies", () => {
    const found = keyAnomalies(
      [
        event({ at: at("2031-03-03T10:00:00Z") }),
        event({ principal: "api" }),
        event({ auctionId: null }),
        event({ auctionId: "zz" }),
      ],
      auctions,
      ["worker"],
    );
    expect(found.map((a) => a.kind)).toEqual([
      "EARLY",
      "WRONG_PRINCIPAL",
      "NO_AUCTION",
      "UNKNOWN_AUCTION",
    ]);
  });
});

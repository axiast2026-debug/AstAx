import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  chainAuditEntry,
  GENESIS_HASH,
  verifyAuditChain,
  type AuditEntryContent,
  type ChainedAuditEntry,
} from "./index.js";

function content(i: number): AuditEntryContent {
  return {
    at: new Date(Date.UTC(2026, 10, 16, 9, i)),
    actorUserId: `user-${i}`,
    actorMembershipId: null,
    actorOrganizationId: "org-agenzia-uno",
    action: i % 2 === 0 ? "QUOTE_REQUEST_VIEWED" : "SEALED_BID_ACCESS_DENIED",
    targetType: "QuoteRequest",
    targetId: `req-${i}`,
    before: null,
    after: { status: "AUCTION_OPEN", round: i },
    reason: null,
    ip: "203.0.113.10",
    userAgent: "test",
  };
}

function buildChain(n: number): ChainedAuditEntry[] {
  const chain: ChainedAuditEntry[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < n; i += 1) {
    const entry = chainAuditEntry(content(i), prev);
    chain.push(entry);
    prev = entry.hash;
  }
  return chain;
}

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

describe("SIC-04 audit hash chain", () => {
  it("each entry contains the hash of the previous one", () => {
    const chain = buildChain(3);
    expect(at(chain, 0).prevHash).toBe(GENESIS_HASH);
    expect(at(chain, 1).prevHash).toBe(at(chain, 0).hash);
    expect(at(chain, 2).prevHash).toBe(at(chain, 1).hash);
    expect(at(chain, 0).hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an intact chain verifies", () => {
    const chain = buildChain(50);
    expect(verifyAuditChain(chain)).toEqual({
      ok: true,
      checked: 50,
      lastHash: at(chain, 49).hash,
    });
  });

  it("detects an altered row", () => {
    const chain = buildChain(10);
    chain[4] = { ...at(chain, 4), after: { status: "OFFERS_AVAILABLE", round: 4 } };
    expect(verifyAuditChain(chain)).toMatchObject({
      ok: false,
      index: 4,
      problem: "HASH_MISMATCH",
    });
  });

  it("detects an altered row whose hash was recomputed: the next link breaks", () => {
    const chain = buildChain(10);
    chain[4] = chainAuditEntry({ ...at(chain, 4), reason: "tampered" }, at(chain, 4).prevHash);
    expect(verifyAuditChain(chain)).toMatchObject({ ok: false, index: 5, problem: "BROKEN_LINK" });
  });

  it("detects a deleted row", () => {
    const chain = buildChain(10);
    chain.splice(3, 1);
    expect(verifyAuditChain(chain)).toMatchObject({ ok: false, index: 3, problem: "BROKEN_LINK" });
  });

  it("detects a reordering", () => {
    const chain = buildChain(10);
    const second = at(chain, 2);
    chain[2] = at(chain, 3);
    chain[3] = second;
    expect(verifyAuditChain(chain)).toMatchObject({ ok: false, index: 2, problem: "BROKEN_LINK" });
  });

  it("verifies a segment starting from the last checked hash", () => {
    const chain = buildChain(20);
    const first = verifyAuditChain(chain.slice(0, 12));
    if (!first.ok) throw new Error("first segment should verify");
    expect(verifyAuditChain(chain.slice(12), first.lastHash)).toMatchObject({
      ok: true,
      checked: 8,
    });
  });
});

describe("canonical JSON", () => {
  it("does not depend on key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: "x" } })).toBe(
      canonicalJson({ a: { c: "x", d: [1, 2] }, b: 1 }),
    );
  });

  it("writes dates as ISO strings and drops undefined", () => {
    const json = canonicalJson({ at: new Date("2026-11-16T09:00:00.000Z"), skip: undefined });
    expect(JSON.parse(json)).toEqual({ at: "2026-11-16T09:00:00.000Z" });
  });

  it("refuses values that cannot be represented exactly", () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
    expect(() => canonicalJson({ x: () => 1 })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { isMagicLinkToken } from "./magic-link.js";

describe("magic link token (ADR 0019)", () => {
  it("SIC-05 accepts only 32 bytes in base64url", () => {
    expect(isMagicLinkToken("abcdefghijklmnopqrstuvwxyz0123456789ABCDE-_")).toBe(true);
    expect(isMagicLinkToken("abcdefghijklmnopqrstuvwxyz0123456789ABCDE-")).toBe(false);
    expect(isMagicLinkToken("abcdefghijklmnopqrstuvwxyz0123456789ABCDE-_=")).toBe(false);
    expect(isMagicLinkToken("abcdefghijklmnopqrstuvwxyz0123456789ABCDE+/")).toBe(false);
    expect(isMagicLinkToken("")).toBe(false);
    expect(isMagicLinkToken(undefined)).toBe(false);
    expect(isMagicLinkToken(["a"])).toBe(false);
  });
});

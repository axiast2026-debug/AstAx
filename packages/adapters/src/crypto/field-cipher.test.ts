import { describe, expect, it } from "vitest";
import { LocalFieldCipher } from "./field-cipher.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

describe("SIC-03 field encryption", () => {
  const cipher = new LocalFieldCipher(KEY_A, KEY_B);

  it("round-trips and never stores the plain value", () => {
    const encrypted = cipher.encrypt("giulia.neri@example.test");
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("giulia");
    expect(cipher.decrypt(encrypted)).toBe("giulia.neri@example.test");
  });

  it("encrypts the same value differently each time", () => {
    expect(cipher.encrypt("RSSMRA80A01H501U")).not.toBe(cipher.encrypt("RSSMRA80A01H501U"));
  });

  it("detects tampering", () => {
    const encrypted = cipher.encrypt("IT60X0542811101000000123456");
    const tampered = `${encrypted.slice(0, -4)}AAAA`;
    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it("refuses a value encrypted with another key", () => {
    const other = new LocalFieldCipher(KEY_B, KEY_B);
    expect(() => other.decrypt(cipher.encrypt("x"))).toThrow();
  });

  it("blind index finds the same value written differently", () => {
    expect(cipher.blindIndex("email", " Giulia.Neri@Example.test ")).toBe(
      cipher.blindIndex("email", "giulia.neri@example.test"),
    );
    expect(cipher.blindIndex("phone", "333 123 4567")).toBe(
      cipher.blindIndex("phone", "+39 3331234567"),
    );
    expect(cipher.blindIndex("phone", "0039 333 1234567")).toBe(
      cipher.blindIndex("phone", "3331234567"),
    );
    expect(cipher.blindIndex("vatNumber", "IT 12345678903")).toBe(
      cipher.blindIndex("vatNumber", "12345678903"),
    );
  });

  it("blind index depends on the kind and on the key", () => {
    expect(cipher.blindIndex("email", "x@example.test")).not.toBe(
      cipher.blindIndex("phone", "x@example.test"),
    );
    expect(new LocalFieldCipher(KEY_A, KEY_A).blindIndex("email", "x@example.test")).not.toBe(
      cipher.blindIndex("email", "x@example.test"),
    );
  });

  it("rejects malformed keys", () => {
    expect(() => new LocalFieldCipher("short", KEY_B)).toThrow(/FIELD_ENCRYPTION_KEY/);
  });
});

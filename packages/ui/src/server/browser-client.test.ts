import { describe, expect, it } from "vitest";
import { browserClientFrom } from "./browser-client.js";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("LEG-01 browser address passed on to the API", () => {
  it("without a trusted proxy a header written by the browser is ignored", () => {
    const client = browserClientFrom(
      headers({ "x-forwarded-for": "6.6.6.6", "user-agent": "Browser" }),
      false,
    );
    expect(client).toEqual({ forwardedFor: null, userAgent: "Browser" });
  });

  it("behind our proxy only the last entry, appended by the proxy, counts", () => {
    // The browser forged 6.6.6.6; the proxy appended the real address 198.51.100.7.
    const client = browserClientFrom(headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.7" }), true);
    expect(client.forwardedFor).toBe("198.51.100.7");
  });

  it("refuses anything that is not an address", () => {
    expect(browserClientFrom(headers({ "x-forwarded-for": "<script>" }), true).forwardedFor).toBe(
      null,
    );
    expect(browserClientFrom(headers({}), true).forwardedFor).toBe(null);
  });
});

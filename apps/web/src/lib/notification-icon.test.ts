import { describe, expect, it } from "vitest";
import { notificationIcon } from "./notification-icon";

describe("the icon of a notice (centro notifiche)", () => {
  it("shows the moment of the request", () => {
    expect(notificationIcon("auction.opened.requester")).toBe("clock");
    expect(notificationIcon("auction.closed.requester")).toBe("envelopeOpen");
    expect(notificationIcon("guarantee.expiring")).toBe("hourglass");
    expect(notificationIcon("policy.issued")).toBe("shieldCheck");
    expect(notificationIcon("request.integration_requested")).toBe("envelope");
  });

  it("warns on what went wrong, before the moment it belongs to", () => {
    expect(notificationIcon("auction.deserted.requester")).toBe("warning");
    expect(notificationIcon("payment.failed")).toBe("warning");
  });

  it("falls back to the information sign", () => {
    expect(notificationIcon("survey.post_sale")).toBe("info");
  });
});

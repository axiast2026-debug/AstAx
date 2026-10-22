import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, userId, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, docs/notifiche.md: the choices per event and channel are
// respected; a mandatory notification cannot be switched off; the push reaches
// the browsers subscribed; the back office gets the texts in Italian (ADR 0017).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const EMAIL = "privato.preferenze@example.test";
let customer: Who;

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "bo-verifier");
  customer = {
    token: await h.token({
      sub: "kc-private-preferences-test",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email: EMAIL,
      givenName: "Paola",
      familyName: "Preferenze",
    }),
  };
  const pending = (await (await h.call("/legal/pending", customer)).json()) as {
    versionId: string;
  }[];
  await h.call("/legal/acceptances", {
    ...customer,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
});

afterAll(async () => {
  await h.close();
});

describe("phase 7 the notification preferences", () => {
  it("the email switched off is not sent; the push goes to the browser; in app stays", async () => {
    const list = await r.json<
      { eventKey: string; channels: { channel: string; locked: boolean; enabled: boolean }[] }[]
    >(await r.call(customer, "/me/notifications/preferences"), 200);
    const integration = list.find((e) => e.eventKey === "request.integration_requested");
    expect(integration?.channels.map((c) => c.channel).sort()).toEqual(["EMAIL", "PUSH"]);
    await r.json(
      await r.call(customer, "/me/notifications/preferences", {
        method: "PUT",
        body: { eventKey: "request.integration_requested", channel: "EMAIL", enabled: false },
      }),
      200,
    );
    await r.json(
      await r.call(customer, "/me/notifications/push-subscriptions", {
        body: {
          endpoint: "https://fcm.googleapis.com/fcm/send/preferences-test",
          keys: { p256dh: "BPreferencesTestKey0001", auth: "AuthPreferences1" },
        },
      }),
      201,
    );
    // Phase 8 (SSRF): an address that is not a browser's push service is refused.
    for (const endpoint of [
      "http://fcm.googleapis.com/x",
      "https://10.0.0.5/x",
      "https://api.astax.internal:4000/x",
    ]) {
      expect(
        (
          await r.call(customer, "/me/notifications/push-subscriptions", {
            body: {
              endpoint,
              keys: { p256dh: "BPreferencesTestKey0001", auth: "AuthPreferences1" },
            },
          })
        ).status,
      ).toBe(400);
    }
    const request = await r.submittedPrivateRequest(customer, EMAIL);
    const verifier = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    const emailsBefore = h.email.sent.filter((m) => m.to === EMAIL).length;
    const pushesBefore = h.push.sent.length;
    await r.json(
      await r.call(verifier, `/verification/requests/${request.id}/integration`, {
        body: {
          reasonCodes: ["UNREADABLE_DOCUMENT"],
          message: "La patente non si legge",
          sections: ["driving"],
          documents: ["DRIVING_LICENCE"],
        },
      }),
      200,
    );
    const inbox = await r.json<{ items: { eventKey: string }[] }>(
      await r.call(customer, "/me/notifications"),
      200,
    );
    expect(inbox.items.some((n) => n.eventKey === "request.integration_requested")).toBe(true);
    expect(h.email.sent.filter((m) => m.to === EMAIL).length).toBe(emailsBefore);
    const pushes = h.push.sent.slice(pushesBefore);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.subscription.endpoint).toBe(
      "https://fcm.googleapis.com/fcm/send/preferences-test",
    );
    expect(pushes[0]?.message.url).toBe(`/preventivi/${request.id}`);
  });

  it("a mandatory notification (the codes) cannot be switched off", async () => {
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(customer, "/me/notifications/preferences", {
        method: "PUT",
        body: { eventKey: "auth.otp", channel: "EMAIL", enabled: false },
      }),
      409,
    );
    expect(refused.errors[0]?.issue).toBe("MANDATORY");
  });

  it("the back office gets the texts in Italian, the only language (ADR 0017)", async () => {
    await r.submittedPrivateRequest(customer, EMAIL);
    const note = await system((tx) =>
      tx.notification.findFirst({
        where: { userId: userId("bo-verifier"), eventKey: "request.submitted.bo" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(note?.title).toBe("Nuova richiesta da verificare");
  });

  it("read all: the counter goes to zero", async () => {
    await r.call(customer, "/me/notifications/read-all", { body: {} });
    const inbox = await r.json<{ unread: number }>(
      await r.call(customer, "/me/notifications"),
      200,
    );
    expect(inbox.unread).toBe(0);
  });
});

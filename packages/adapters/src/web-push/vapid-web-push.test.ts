import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateVapidKeys,
  PushSendError,
  PushSubscriptionGoneError,
  revokingGone,
  VapidWebPush,
} from "./vapid-web-push.js";

// Phase 8: the real Web Push. A browser's keys are made here; no push service is called.
const browser = createECDH("prime256v1");
browser.generateKeys();
const subscription = {
  endpoint: "https://push.example.test/send/abc",
  keys: {
    p256dh: browser.getPublicKey("base64url"),
    auth: randomBytes(16).toString("base64url"),
  },
};
const vapid = { ...generateVapidKeys(), subject: "mailto:sicurezza@astax.test" };
const message = { title: "Asta chiusa", body: "Le offerte sono pronte.", url: "/preventivi/x" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("phase 8 VapidWebPush", () => {
  it("the request is signed with VAPID and the body is encrypted for the browser (aes128gcm)", () => {
    const details = webpush.generateRequestDetails(subscription, JSON.stringify(message), {
      vapidDetails: vapid,
      TTL: 60,
    });
    expect(details.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(details.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(details.headers.TTL).toBe(60);
    // The text never travels in clear.
    expect(Buffer.from(details.body ?? "").toString("utf8")).not.toContain("Asta chiusa");
  });

  it("a subscription gone (410) is told apart; other failures carry the status only", async () => {
    const spy = vi.spyOn(webpush, "sendNotification");
    const push = new VapidWebPush(vapid);
    spy.mockRejectedValueOnce(new webpush.WebPushError("gone", 410, {}, "", subscription.endpoint));
    await expect(push.send(subscription, message)).rejects.toBeInstanceOf(
      PushSubscriptionGoneError,
    );
    spy.mockRejectedValueOnce(new webpush.WebPushError("x", 500, {}, "", subscription.endpoint));
    const failure = await push.send(subscription, message).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(PushSendError);
    expect(String((failure as Error).message)).not.toContain("example.test");
  });

  it("revokingGone revokes the subscription and does not retry it", async () => {
    const revoked: string[] = [];
    const gone = { send: async () => Promise.reject(new PushSubscriptionGoneError()) };
    await revokingGone(gone, async (endpoint) => {
      revoked.push(endpoint);
    }).send(subscription, message);
    expect(revoked).toEqual([subscription.endpoint]);
  });
});

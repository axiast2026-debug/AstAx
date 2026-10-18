import webpush from "web-push";
import type { PushMessage, PushSubscriptionData, WebPushPort } from "./web-push.js";

/** The browser's push service says the subscription no longer exists (404 or 410). */
export class PushSubscriptionGoneError extends Error {
  constructor() {
    super("Push subscription gone");
    this.name = "PushSubscriptionGoneError";
  }
}

export class PushSendError extends Error {
  constructor(readonly status: number) {
    super(`Push not sent (status ${status})`);
    this.name = "PushSendError";
  }
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** mailto: or https: of AstAx, sent to the push services. */
  subject: string;
}

/**
 * Phase 8: the real Web Push (RFC 8030/8291/8292) with the VAPID keys of
 * AstAx. The message is encrypted for the browser by the library; the push
 * service of the browser (Google, Mozilla, Apple) only sees ciphertext. The
 * text carries no price and no personal data (rule 8); errors carry the
 * status code only, never the endpoint.
 */
export class VapidWebPush implements WebPushPort {
  constructor(
    private readonly keys: VapidKeys,
    private readonly options: { ttlSeconds?: number } = {},
  ) {}

  async send(subscription: PushSubscriptionData, message: PushMessage): Promise<void> {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(message), {
        vapidDetails: this.keys,
        TTL: this.options.ttlSeconds ?? 24 * 3600,
        urgency: "normal",
      });
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          throw new PushSubscriptionGoneError();
        }
        throw new PushSendError(error.statusCode);
      }
      throw new PushSendError(0);
    }
  }
}

/** New VAPID keys (pnpm env:init in development; Secrets Manager in the cloud). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

/**
 * Wraps a sender: a subscription gone is revoked (through `revoke`) and the
 * message counts as handled, so it is not retried.
 */
export function revokingGone(
  push: WebPushPort,
  revoke: (endpoint: string) => Promise<void>,
): WebPushPort {
  return {
    async send(subscription, message) {
      try {
        await push.send(subscription, message);
      } catch (error) {
        if (!(error instanceof PushSubscriptionGoneError)) throw error;
        await revoke(subscription.endpoint);
      }
    },
  };
}

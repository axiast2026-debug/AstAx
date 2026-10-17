import type { Clock } from "../clock/clock.js";
import { verifyWebhook, webhookSignature } from "../signature/signature.js";
import type { ObjectStoragePort } from "../storage/object-storage.js";

/**
 * Payments (docs/adattatori.md; real provider Fabrick in phase 8). One payment
 * for the customer, premium and fee kept apart (PAG-01, decision 21).
 */
export type PaymentMethodKind = "CARD" | "INSTANT_TRANSFER";
export type ProviderPaymentStatus = "PENDING" | "CAPTURED" | "FAILED";

export interface PaymentEvent {
  eventId: string;
  providerRef: string;
  status: ProviderPaymentStatus;
  method: PaymentMethodKind;
}

export interface PaymentsPort {
  readonly provider: string;
  createCheckout(input: {
    paymentId: string;
    idempotencyKey: string;
    amounts: { premiumCents: number; feeCents: number };
    methods: PaymentMethodKind[];
    returnUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  parseWebhook(headers: Record<string, string | undefined>, body: string): PaymentEvent;
}

export const FAKE_PAYMENTS_PROVIDER = "fake-payments";
/** docs/adattatori.md: a card ending with 0002 is refused. */
export const FAKE_REFUSED_CARD_SUFFIX = "0002";
const SIGNATURE_HEADER = "x-fake-signature";

interface FakeCheckout {
  paymentId: string;
  idempotencyKey: string;
  amounts: { premiumCents: number; feeCents: number };
  methods: PaymentMethodKind[];
  returnUrl: string;
  createdAt: string;
}

/**
 * Proposal B of phase 5: a simulated payment page. A card ending with 0002 is
 * refused, any other is captured; an instant transfer is pending and then
 * confirmed (proposal I: the development server sends the confirmation after
 * the wait, or at once from the development tools). The checkout lives in
 * the object storage; the same idempotency key gives the same checkout.
 */
export class FakePaymentsProvider implements PaymentsPort {
  readonly provider = FAKE_PAYMENTS_PROVIDER;

  constructor(
    private readonly storage: ObjectStoragePort,
    private readonly clock: Clock,
    private readonly secret: string,
    private readonly pageUrl: (providerRef: string) => string,
  ) {}

  private key(providerRef: string) {
    return `fake-payments/${providerRef}.json`;
  }

  async createCheckout(input: {
    paymentId: string;
    idempotencyKey: string;
    amounts: { premiumCents: number; feeCents: number };
    methods: PaymentMethodKind[];
    returnUrl: string;
  }) {
    // The provider reference follows from the idempotency key: a retry finds the same.
    const providerRef = `pay-${input.idempotencyKey}`;
    const checkout: FakeCheckout = { ...input, createdAt: this.clock.now().toISOString() };
    await this.storage.put({
      key: this.key(providerRef),
      body: new TextEncoder().encode(JSON.stringify(checkout)),
      contentType: "application/json",
    });
    return { providerRef, redirectUrl: this.pageUrl(providerRef) };
  }

  /** What the payment page shows. */
  async checkout(providerRef: string): Promise<{
    amounts: { premiumCents: number; feeCents: number };
    methods: PaymentMethodKind[];
    returnUrl: string;
  }> {
    const c = JSON.parse(
      new TextDecoder().decode(await this.storage.get(this.key(providerRef))),
    ) as FakeCheckout;
    return { amounts: c.amounts, methods: c.methods, returnUrl: c.returnUrl };
  }

  /**
   * The customer pays on the simulated page: the webhook the provider would
   * send, signed. An instant transfer is first PENDING; `confirmTransfer`
   * gives its confirmation.
   */
  pay(
    providerRef: string,
    input: { method: "CARD"; cardNumber: string } | { method: "INSTANT_TRANSFER" },
  ): { body: string; headers: Record<string, string> } {
    const status: ProviderPaymentStatus =
      input.method === "INSTANT_TRANSFER"
        ? "PENDING"
        : input.cardNumber.replace(/\s/g, "").endsWith(FAKE_REFUSED_CARD_SUFFIX)
          ? "FAILED"
          : "CAPTURED";
    return this.event(providerRef, status, input.method);
  }

  confirmTransfer(providerRef: string): { body: string; headers: Record<string, string> } {
    return this.event(providerRef, "CAPTURED", "INSTANT_TRANSFER");
  }

  private event(providerRef: string, status: ProviderPaymentStatus, method: PaymentMethodKind) {
    const event: PaymentEvent = {
      eventId: `${providerRef}-${status.toLowerCase()}-${this.clock.now().getTime()}`,
      providerRef,
      status,
      method,
    };
    const body = JSON.stringify(event);
    return { body, headers: { [SIGNATURE_HEADER]: webhookSignature(this.secret, body) } };
  }

  parseWebhook(headers: Record<string, string | undefined>, body: string): PaymentEvent {
    verifyWebhook(this.secret, body, headers[SIGNATURE_HEADER]);
    return JSON.parse(body) as PaymentEvent;
  }
}

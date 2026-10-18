import type { Clock } from "../clock/clock.js";
import { buildFatturaPa, type FatturaPaInput } from "../xml/fatturapa.js";
import { validateXml } from "../xml/validate.js";

/**
 * Electronic invoicing through SDI (docs/adattatori.md; real provider Openapi
 * SDI or A-Cube in phase 8). The domain gives the data, the adapter makes and
 * checks the XML and sends it.
 */
export type SdiDeliveryStatus = "SENT" | "DELIVERED" | "REJECTED";

export interface SdiEvent {
  sdiRef: string;
  status: SdiDeliveryStatus;
}

export interface EInvoicingPort {
  readonly provider: string;
  /** Builds the XML, checks it against the official schema, and sends it. */
  send(
    invoice: FatturaPaInput,
  ): Promise<{ sdiRef: string; status: SdiDeliveryStatus; xml: string }>;
  getStatus(sdiRef: string): Promise<SdiDeliveryStatus>;
  /** The provider's callback with an SDI receipt (phase 8); checked, then one event. */
  parseWebhook?(headers: Record<string, string | undefined>, body: string): SdiEvent;
}

export class InvalidInvoiceXmlError extends Error {
  constructor(readonly problems: string[]) {
    super(`The invoice XML does not pass the FatturaPA schema: ${problems.length} problems`);
  }
}

export const FAKE_E_INVOICING_PROVIDER = "fake-sdi";
/** docs/adattatori.md: the fake refuses this VAT number, to show a rejection. */
export const FAKE_REJECTED_VAT = "00000000000";
const DELIVERY_MS = 5_000;

/**
 * The fake SDI: an invoice is SENT, then DELIVERED a few seconds later by
 * the clock; the VAT number 00000000000 is REJECTED. The XML is checked
 * against the schema as the real SDI would.
 */
export class FakeEInvoicing implements EInvoicingPort {
  readonly provider = FAKE_E_INVOICING_PROVIDER;
  readonly #sent = new Map<string, { at: number; rejected: boolean }>();

  constructor(private readonly clock: Clock) {}

  async send(invoice: FatturaPaInput) {
    const xml = buildFatturaPa(invoice);
    const check = await validateXml("FATTURA_PA", xml);
    if (!check.valid) throw new InvalidInvoiceXmlError(check.errors);
    const sdiRef = `sdi-${invoice.progressive}`;
    const rejected = invoice.customer.vatNumber === FAKE_REJECTED_VAT;
    this.#sent.set(sdiRef, { at: this.clock.now().getTime(), rejected });
    return { sdiRef, status: rejected ? ("REJECTED" as const) : ("SENT" as const), xml };
  }

  async getStatus(sdiRef: string): Promise<SdiDeliveryStatus> {
    const sent = this.#sent.get(sdiRef);
    if (!sent) return "SENT";
    if (sent.rejected) return "REJECTED";
    return this.clock.now().getTime() - sent.at >= DELIVERY_MS ? "DELIVERED" : "SENT";
  }
}

import { timingSafeEqual } from "node:crypto";
import { buildFatturaPa, type FatturaPaInput } from "../xml/fatturapa.js";
import { validateXml } from "../xml/validate.js";
import {
  InvalidInvoiceXmlError,
  type EInvoicingPort,
  type SdiDeliveryStatus,
  type SdiEvent,
} from "./e-invoicing.js";

export const OPENAPI_SDI_URLS = {
  sandbox: "https://test.sdi.openapi.it",
  production: "https://sdi.openapi.it",
} as const;

export class EInvoicingError extends Error {
  constructor(
    readonly status: number,
    readonly operation: string,
  ) {
    super(`SDI provider ${operation} failed with status ${status}`);
    this.name = "EInvoicingError";
  }
}

export class InvalidSdiWebhookError extends Error {
  constructor() {
    super("SDI webhook not authenticated");
    this.name = "InvalidSdiWebhookError";
  }
}

/**
 * The SDI receipts (notifiche) as our three states: NS (scarto) refuses the
 * invoice; RC (consegna), MC (mancata consegna: the invoice is issued and in
 * the recipient's tax drawer) and AT (attestazione) close it as delivered.
 */
export function statusOfNotifications(types: readonly string[]): SdiDeliveryStatus {
  if (types.includes("NS")) return "REJECTED";
  if (types.some((t) => t === "RC" || t === "MC" || t === "AT")) return "DELIVERED";
  return "SENT";
}

export interface OpenapiSdiOptions {
  baseUrl: string;
  token: string;
  /** The value of the header Openapi sends with each callback (set in /api_configurations). */
  webhookSecret?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Waits between attempts on temporary errors (5xx, 429, network). */
  retryDelaysMs?: readonly number[];
}

/**
 * Phase 8: Openapi SDI (docs/adattatori.md). The adapter builds the FatturaPA
 * XML, checks it against the official schema (ADR 0009) and sends it as is;
 * the state comes from the SDI receipts. Temporary errors are retried with
 * growing waits; errors carry the status and the operation only (SIC-06).
 */
export class OpenapiEInvoicing implements EInvoicingPort {
  readonly provider = "openapi-sdi";
  readonly #fetch: typeof fetch;

  constructor(private readonly options: OpenapiSdiOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  /**
   * `retry`: only for reads. A POST is never sent again: after a timeout SDI may
   * have received it, and a second invoice with the same number is refused (NS).
   */
  private async call<T>(
    operation: string,
    path: string,
    init: RequestInit,
    retry = true,
  ): Promise<T> {
    const delays = retry ? (this.options.retryDelaysMs ?? [500, 2000, 5000]) : [];
    for (let attempt = 0; ; attempt += 1) {
      let status: number;
      try {
        const response = await this.#fetch(`${this.options.baseUrl}${path}`, {
          ...init,
          headers: { ...init.headers, authorization: `Bearer ${this.options.token}` },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
        });
        status = response.status;
        if (response.ok) return (await response.json()) as T;
      } catch {
        status = 0;
      }
      const temporary = status === 0 || status === 429 || status >= 500;
      const wait = delays[attempt];
      if (!temporary || wait === undefined) throw new EInvoicingError(status, operation);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  async send(invoice: FatturaPaInput) {
    const xml = buildFatturaPa(invoice);
    const check = await validateXml("FATTURA_PA", xml);
    if (!check.valid) throw new InvalidInvoiceXmlError(check.errors);
    const out = await this.call<{ data?: { uuid?: string } }>(
      "send",
      "/invoices",
      {
        method: "POST",
        headers: { "content-type": "application/xml" },
        body: xml,
      },
      false,
    );
    const sdiRef = out.data?.uuid;
    if (!sdiRef) throw new EInvoicingError(200, "send");
    return { sdiRef, status: "SENT" as const, xml };
  }

  async getStatus(sdiRef: string): Promise<SdiDeliveryStatus> {
    const out = await this.call<{ data?: { notifications?: { type?: unknown }[] } }>(
      "getStatus",
      `/invoices/${encodeURIComponent(sdiRef)}`,
      { method: "GET" },
    );
    const types = (out.data?.notifications ?? [])
      .map((n) => n.type)
      .filter((t): t is string => typeof t === "string");
    return statusOfNotifications(types);
  }

  /**
   * The callback «customer-notification»: authenticated by the header value
   * agreed in the configuration (compared in constant time).
   */
  parseWebhook(headers: Record<string, string | undefined>, body: string): SdiEvent {
    const secret = this.options.webhookSecret;
    const given = Buffer.from(headers.authorization ?? "", "utf8");
    const expected = Buffer.from(secret ?? "", "utf8");
    // Lengths in bytes: a header with multibyte characters is refused, not an error.
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new InvalidSdiWebhookError();
    }
    const parsed = JSON.parse(body) as {
      data?: { notification?: { invoice_uuid?: string; type?: string } };
    };
    const notification = parsed.data?.notification;
    if (!notification?.invoice_uuid || !notification.type) throw new InvalidSdiWebhookError();
    return {
      sdiRef: notification.invoice_uuid,
      status: statusOfNotifications([notification.type]),
    };
  }
}

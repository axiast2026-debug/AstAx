import { EmailSendError, type EmailMessage, type EmailSender } from "./email-sender.js";

export interface ResendOptions {
  apiKey: string;
  from: { email: string; name: string };
  /** Tests pass their own; the default is the global fetch. */
  fetch?: typeof fetch;
}

const RESEND_URL = "https://api.resend.com/emails";

/**
 * ADR 0020: email of the online demo with Resend's HTTP API, from an address
 * of the demo's domain. The address and the text never reach the logs; a
 * failure carries the HTTP status only (rule 8).
 */
export class ResendEmailSender implements EmailSender {
  readonly #fetch: typeof fetch;

  constructor(private readonly options: ResendOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  async send(message: EmailMessage): Promise<void> {
    const { from, apiKey } = this.options;
    let response: Response;
    try {
      response = await this.#fetch(RESEND_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: `${from.name.replace(/[<>"]/g, "")} <${from.email}>`,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new EmailSendError(0);
    }
    if (!response.ok) throw new EmailSendError(response.status);
  }
}

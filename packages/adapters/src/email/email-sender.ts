/** Outgoing email port. Development and tests never reach a real provider (rule 9). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class EmailSendError extends Error {
  constructor(readonly status: number) {
    super(`Email not sent (status ${status})`);
    this.name = "EmailSendError";
  }
}

/** Development: delivers to the local Mailpit through its HTTP API. */
export class MailpitEmailSender implements EmailSender {
  constructor(
    private readonly mailpitUrl: string,
    private readonly from: { email: string; name: string },
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(`${this.mailpitUrl}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: { Email: this.from.email, Name: this.from.name },
        To: [{ Email: message.to }],
        Subject: message.subject,
        Text: message.text,
      }),
    });
    if (!response.ok) throw new EmailSendError(response.status);
  }
}

/** Tests: keeps the messages in memory. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/**
 * Names reserved for tests and examples (RFC 2606, RFC 6761): never a real
 * mailbox. The synthetic users of the seed live there (rule 11).
 */
const RESERVED = /\.(test|example|invalid|localhost)$|(^|\.)example\.(com|net|org)$/i;

export function isReservedTestAddress(address: string): boolean {
  const domain = address.slice(address.lastIndexOf("@") + 1).trim();
  return RESERVED.test(domain);
}

/**
 * ADR 0020: with a real provider on the online demo, a message to a reserved
 * test address goes to the fake mailbox instead, so no email to an invented
 * user ever leaves the server.
 */
export class TestAddressRouter implements EmailSender {
  constructor(
    private readonly real: EmailSender,
    private readonly fake: EmailSender,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await (isReservedTestAddress(message.to) ? this.fake : this.real).send(message);
  }
}

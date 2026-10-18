import { SendEmailCommand, SESv2Client, type SendEmailCommandOutput } from "@aws-sdk/client-sesv2";
import { EmailSendError, type EmailMessage, type EmailSender } from "./email-sender.js";

export interface SesOptions {
  region: string;
  from: { email: string; name: string };
  /** SES configuration set: bounces and complaints go to its event destination. */
  configurationSet?: string;
  client?: { send(command: SendEmailCommand): Promise<SendEmailCommandOutput> };
}

/**
 * Phase 8: email with Amazon SES in the EU (DKIM on the AstAx domain). The
 * address and the text never reach the logs; a failure carries the HTTP
 * status only (rule 8).
 */
export class SesEmailSender implements EmailSender {
  readonly #client: NonNullable<SesOptions["client"]>;

  constructor(private readonly options: SesOptions) {
    this.#client =
      options.client ??
      new SESv2Client({
        region: options.region,
        requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000 },
      });
  }

  async send(message: EmailMessage): Promise<void> {
    const { from } = this.options;
    try {
      await this.#client.send(
        new SendEmailCommand({
          FromEmailAddress: `"${from.name.replace(/"/g, "")}" <${from.email}>`,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: "UTF-8" },
              Body: { Text: { Data: message.text, Charset: "UTF-8" } },
            },
          },
          ...(this.options.configurationSet
            ? { ConfigurationSetName: this.options.configurationSet }
            : {}),
        }),
      );
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      throw new EmailSendError(status ?? 0);
    }
  }
}

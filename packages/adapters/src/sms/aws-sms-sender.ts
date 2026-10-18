import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
  type SendTextMessageCommandOutput,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import type { SmsMessage, SmsPort } from "./sms-sender.js";

export class SmsSendError extends Error {
  constructor(readonly status: number) {
    super(`SMS not sent (status ${status})`);
    this.name = "SmsSendError";
  }
}

/** A number in E.164: Italian numbers without a prefix get +39. */
export function e164(phone: string): string {
  const compact = phone.replace(/[\s.()-]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  return `+39${compact}`;
}

export interface AwsSmsOptions {
  region: string;
  /** The alphanumeric sender «AstAx» (registered for Italy) or a number. */
  originator: string;
  configurationSet?: string;
  client?: { send(command: SendTextMessageCommand): Promise<SendTextMessageCommandOutput> };
}

/**
 * Phase 8, proposal C: transactional SMS with AWS End User Messaging. The
 * number and the text (it may hold a one-time code) are never logged.
 */
export class AwsSmsSender implements SmsPort {
  readonly #client: NonNullable<AwsSmsOptions["client"]>;

  constructor(private readonly options: AwsSmsOptions) {
    this.#client =
      options.client ??
      new PinpointSMSVoiceV2Client({
        region: options.region,
        requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000 },
      });
  }

  async send(message: SmsMessage): Promise<void> {
    try {
      await this.#client.send(
        new SendTextMessageCommand({
          DestinationPhoneNumber: e164(message.to),
          MessageBody: message.text,
          OriginationIdentity: this.options.originator,
          MessageType: "TRANSACTIONAL",
          ...(this.options.configurationSet
            ? { ConfigurationSetName: this.options.configurationSet }
            : {}),
        }),
      );
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      throw new SmsSendError(status ?? 0);
    }
  }
}

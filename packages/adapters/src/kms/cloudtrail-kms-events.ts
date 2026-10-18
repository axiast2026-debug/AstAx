import {
  CloudTrailClient,
  LookupEventsCommand,
  type LookupEventsCommandOutput,
} from "@aws-sdk/client-cloudtrail";

/** One use of a key to decrypt, as AWS or the application recorded it. */
export interface KeyDecryptEvent {
  at: Date;
  /** The AWS key (ARN) or the AstAx key id. */
  key: string;
  auctionId: string | null;
  /** Who decrypted: the IAM role (CloudTrail) or the process (application). */
  principal: string;
  ok: boolean;
}

export interface KeyEventsSource {
  decrypts(from: Date, to: Date): Promise<KeyDecryptEvent[]>;
}

interface CloudTrailRecord {
  eventTime?: string;
  errorCode?: string;
  userIdentity?: { arn?: string; sessionContext?: { sessionIssuer?: { arn?: string } } };
  requestParameters?: { encryptionContext?: Record<string, string>; keyId?: string };
  resources?: { ARN?: string; type?: string }[];
}

/**
 * Phase 8 (docs/busta-chiusa.md): the decryptions with KMS as CloudTrail
 * recorded them, outside the application. The nightly check compares them
 * with the closing time of each auction (BC-03). Only identifiers are read.
 */
export class CloudTrailKmsEvents implements KeyEventsSource {
  readonly #client: { send(c: LookupEventsCommand): Promise<LookupEventsCommandOutput> };

  constructor(
    region: string,
    /** The ARN of the sealed bids' key: decryptions with other keys are not read. */
    private readonly keyArn: string,
    client?: { send(c: LookupEventsCommand): Promise<LookupEventsCommandOutput> },
  ) {
    this.#client = client ?? new CloudTrailClient({ region });
  }

  async decrypts(from: Date, to: Date): Promise<KeyDecryptEvent[]> {
    const events: KeyDecryptEvent[] = [];
    let token: string | undefined;
    do {
      const page = await this.#client.send(
        new LookupEventsCommand({
          StartTime: from,
          EndTime: to,
          LookupAttributes: [{ AttributeKey: "EventName", AttributeValue: "Decrypt" }],
          ...(token ? { NextToken: token } : {}),
        }),
      );
      for (const event of page.Events ?? []) {
        if (event.EventSource && event.EventSource !== "kms.amazonaws.com") continue;
        const record = JSON.parse(event.CloudTrailEvent ?? "{}") as CloudTrailRecord;
        const key =
          record.resources?.find((r) => r.type === "AWS::KMS::Key")?.ARN ??
          record.requestParameters?.keyId ??
          "";
        if (key !== this.keyArn) continue;
        events.push({
          at: new Date(record.eventTime ?? event.EventTime ?? 0),
          key,
          auctionId: record.requestParameters?.encryptionContext?.auctionId ?? null,
          principal:
            record.userIdentity?.sessionContext?.sessionIssuer?.arn ??
            record.userIdentity?.arn ??
            "",
          ok: !record.errorCode,
        });
      }
      token = page.NextToken;
    } while (token);
    return events;
  }
}

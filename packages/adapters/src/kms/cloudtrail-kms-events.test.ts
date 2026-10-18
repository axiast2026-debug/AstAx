import type { LookupEventsCommand, LookupEventsCommandOutput } from "@aws-sdk/client-cloudtrail";
import { describe, expect, it } from "vitest";
import { CloudTrailKmsEvents } from "./cloudtrail-kms-events.js";

// Phase 8, BC-03: the decryptions as CloudTrail records them (two pages).
const KEY = "arn:aws:kms:eu-south-1:111122223333:key/sealed";
const record = (over: Record<string, unknown>) =>
  JSON.stringify({
    eventTime: "2031-03-03T11:00:01Z",
    userIdentity: {
      arn: "arn:aws:sts::111122223333:assumed-role/astax-worker/task",
      sessionContext: { sessionIssuer: { arn: "arn:aws:iam::111122223333:role/astax-worker" } },
    },
    requestParameters: { encryptionContext: { purpose: "sealed-bid", auctionId: "a1" } },
    resources: [{ type: "AWS::KMS::Key", ARN: KEY }],
    ...over,
  });

describe("phase 8 CloudTrailKmsEvents", () => {
  it("reads every page, keeps only the sealed bids' key, with role, auction and outcome", async () => {
    const commands: LookupEventsCommand[] = [];
    const pages: LookupEventsCommandOutput[] = [
      {
        Events: [
          { EventSource: "kms.amazonaws.com", CloudTrailEvent: record({}) },
          {
            EventSource: "kms.amazonaws.com",
            CloudTrailEvent: record({ resources: [{ type: "AWS::KMS::Key", ARN: "other" }] }),
          },
        ],
        NextToken: "next",
        $metadata: {},
      },
      {
        Events: [
          {
            EventSource: "kms.amazonaws.com",
            CloudTrailEvent: record({ errorCode: "AccessDeniedException" }),
          },
        ],
        $metadata: {},
      },
    ];
    const source = new CloudTrailKmsEvents("eu-south-1", KEY, {
      send: async (c) => {
        commands.push(c);
        return pages[commands.length - 1] as LookupEventsCommandOutput;
      },
    });
    const events = await source.decrypts(
      new Date("2031-03-03T00:00Z"),
      new Date("2031-03-04T00:00Z"),
    );
    expect(events).toEqual([
      {
        at: new Date("2031-03-03T11:00:01Z"),
        key: KEY,
        auctionId: "a1",
        principal: "arn:aws:iam::111122223333:role/astax-worker",
        ok: true,
      },
      expect.objectContaining({ ok: false }),
    ]);
    expect(commands[1]?.input.NextToken).toBe("next");
    expect(commands[0]?.input.LookupAttributes).toEqual([
      { AttributeKey: "EventName", AttributeValue: "Decrypt" },
    ]);
  });
});

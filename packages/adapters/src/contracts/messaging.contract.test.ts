import type { SendTextMessageCommand } from "@aws-sdk/client-pinpoint-sms-voice-v2";
import type { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { describe, expect, it } from "vitest";
import { EmailSendError, InMemoryEmailSender, type EmailSender } from "../email/email-sender.js";
import { SesEmailSender } from "../email/ses-email-sender.js";
import { AwsSmsSender, e164, SmsSendError } from "../sms/aws-sms-sender.js";
import { InMemorySmsSender, type SmsPort } from "../sms/sms-sender.js";

// Phase 8: what every email and SMS sender must do, then the details of the AWS ones.
function emailContract(make: () => EmailSender, to: string) {
  it("contract: an email with subject and text is accepted", async () => {
    await expect(
      make().send({ to, subject: "Prova di contratto AstAx", text: "Testo di prova." }),
    ).resolves.toBeUndefined();
  });
}

function smsContract(make: () => SmsPort, to: string) {
  it("contract: a short SMS is accepted", async () => {
    await expect(
      make().send({ to, text: "AstAx: codice di prova 123456" }),
    ).resolves.toBeUndefined();
  });
}

const failing = (status: number) => ({
  send: async (): Promise<never> => {
    throw Object.assign(new Error("x"), { $metadata: { httpStatusCode: status } });
  },
});

describe("email contract — fake and SES (simulated)", () => {
  emailContract(() => new InMemoryEmailSender(), "giulia.neri@example.test");
  const sent: SendEmailCommand[] = [];
  emailContract(
    () =>
      new SesEmailSender({
        region: "eu-south-1",
        from: { email: "noreply@astax.it", name: "AstAx" },
        configurationSet: "astax-transactional",
        client: {
          send: async (c) => {
            sent.push(c);
            return { $metadata: {} };
          },
        },
      }),
    "giulia.neri@example.test",
  );

  it("SES: sender, UTF-8 text and configuration set; a failure keeps the status only", async () => {
    const input = sent[0]?.input;
    expect(input?.FromEmailAddress).toBe(`"AstAx" <noreply@astax.it>`);
    expect(input?.Content?.Simple?.Subject?.Charset).toBe("UTF-8");
    expect(input?.ConfigurationSetName).toBe("astax-transactional");
    const ses = new SesEmailSender({
      region: "eu-south-1",
      from: { email: "noreply@astax.it", name: "AstAx" },
      client: failing(400),
    });
    const error = await ses
      .send({ to: "a@example.test", subject: "s", text: "t" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect(String((error as Error).message)).not.toContain("example.test");
  });
});

describe("SMS contract — fake and AWS (simulated)", () => {
  smsContract(() => new InMemorySmsSender(), "+393330000001");
  const sent: SendTextMessageCommand[] = [];
  smsContract(
    () =>
      new AwsSmsSender({
        region: "eu-south-1",
        originator: "AstAx",
        client: {
          send: async (c) => {
            sent.push(c);
            return { $metadata: {} };
          },
        },
      }),
    "333 000 0001",
  );

  it("AWS SMS: E.164 number, sender AstAx, transactional; a failure keeps the status only", async () => {
    expect(sent[0]?.input).toMatchObject({
      DestinationPhoneNumber: "+393330000001",
      OriginationIdentity: "AstAx",
      MessageType: "TRANSACTIONAL",
    });
    expect([e164("0039 333 1234567"), e164("+39 333-123.4567"), e164("3331234567")]).toEqual([
      "+393331234567",
      "+393331234567",
      "+393331234567",
    ]);
    const sms = new AwsSmsSender({
      region: "eu-south-1",
      originator: "AstAx",
      client: failing(429),
    });
    await expect(sms.send({ to: "3330000001", text: "x" })).rejects.toBeInstanceOf(SmsSendError);
  });
});

const env = process.env;
describe.skipIf(!env.CONTRACT_SES_FROM || !env.CONTRACT_SES_TO)(
  "email contract — SES sandbox",
  () => {
    emailContract(
      () =>
        new SesEmailSender({
          region: env.CONTRACT_AWS_REGION ?? "eu-south-1",
          from: { email: env.CONTRACT_SES_FROM ?? "", name: "AstAx" },
        }),
      env.CONTRACT_SES_TO ?? "",
    );
  },
);

describe.skipIf(!env.CONTRACT_SMS_ORIGINATOR || !env.CONTRACT_SMS_TO)(
  "SMS contract — AWS sandbox",
  () => {
    smsContract(
      () =>
        new AwsSmsSender({
          region: env.CONTRACT_AWS_REGION ?? "eu-south-1",
          originator: env.CONTRACT_SMS_ORIGINATOR ?? "",
        }),
      env.CONTRACT_SMS_TO ?? "",
    );
  },
);

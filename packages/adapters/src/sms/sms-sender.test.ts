import { describe, expect, it } from "vitest";
import { InMemoryEmailSender } from "../email/email-sender.js";
import { MailpitSmsSender, smsMailbox } from "./sms-sender.js";

describe("SMS in development", () => {
  it("delivers the SMS to a Mailpit mailbox named after the number", async () => {
    const email = new InMemoryEmailSender();
    await new MailpitSmsSender(email).send({ to: "+39 333 000 0001", text: "AstAx: 123456" });
    expect(email.sent).toEqual([
      { to: "393330000001@sms.astax.test", subject: "SMS AstAx", text: "AstAx: 123456" },
    ]);
    expect(smsMailbox("0039-333-0000001")).toBe("00393330000001@sms.astax.test");
  });
});

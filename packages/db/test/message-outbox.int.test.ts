import { randomUUID } from "node:crypto";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import type { EmailMessage } from "@astax/adapters/email";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbClient } from "../src/client.js";
import { SYSTEM_CONTEXT, withContext } from "../src/context.js";
import { dispatchMessages, markMessageSent, queueMessage } from "../src/message-outbox.js";
import { appDb } from "./fixtures.js";

// Phase 8: emails, SMS and pushes are queued with the change that causes them;
// the worker sends again what the process after the commit did not confirm.
const cipher = new LocalFieldCipher("3".repeat(64), "4".repeat(64));
let db: DbClient;

beforeAll(() => {
  db = appDb();
});

afterAll(async () => {
  await db.$disconnect();
});

const at = (iso: string) => new Date(iso);
const rowOf = (id: string) =>
  withContext(db, SYSTEM_CONTEXT, (tx) => tx.messageOutbox.findUniqueOrThrow({ where: { id } }));

function senders(fail = false) {
  const sent: EmailMessage[] = [];
  return {
    sent,
    senders: {
      email: {
        send: async (m: EmailMessage) => {
          if (fail) throw new Error("provider down");
          sent.push(m);
        },
      },
      sms: { send: async () => undefined },
    },
  };
}

async function queue(to: string, now: Date) {
  return withContext(db, SYSTEM_CONTEXT, (tx) =>
    queueMessage(
      tx,
      cipher,
      { channel: "EMAIL", email: { to, subject: "Oggetto", text: "Testo" } },
      { eventKey: "test.event", ids: { testId: randomUUID() } },
      now,
    ),
  );
}

describe("phase 8 message outbox", () => {
  it("the content is encrypted; a rolled back change leaves nothing to send", async () => {
    const id = await queue("giulia.neri@example.test", at("2031-05-01T08:00:00Z"));
    const row = await rowOf(id);
    expect(row.contentEnc).not.toContain("giulia");
    const lost = randomUUID();
    await expect(
      withContext(db, SYSTEM_CONTEXT, async (tx) => {
        await queueMessage(
          tx,
          cipher,
          { channel: "SMS", sms: { to: "+393330000000", text: "x" } },
          { eventKey: "test.event", ids: { testId: lost } },
          at("2031-05-01T08:00:00Z"),
        );
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const left = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.messageOutbox.count({ where: { ids: { equals: { testId: lost } } } }),
    );
    expect(left).toBe(0);
  });

  it("a message sent after the commit is marked and emptied; the worker does not send it again", async () => {
    const now = at("2031-06-01T08:00:00Z");
    const id = await queue("marco@example.test", now);
    await markMessageSent(db, id, now);
    const row = await rowOf(id);
    expect(row.status).toBe("SENT");
    expect(row.contentEnc).toBe("");
    const { sent, senders: s } = senders();
    await dispatchMessages(db, cipher, s, { now: at("2031-06-01T09:00:00Z") });
    expect(sent.map((m) => m.to)).not.toContain("marco@example.test");
  });

  it("a message left behind is sent by the worker after the grace time, once", async () => {
    const id = await queue("lasciato@example.test", at("2031-07-01T08:00:00Z"));
    const { sent, senders: s } = senders();
    // Within the grace time the sender after the commit may still be working.
    await dispatchMessages(db, cipher, s, { now: at("2031-07-01T08:00:30Z") });
    expect(sent.map((m) => m.to)).not.toContain("lasciato@example.test");
    await dispatchMessages(db, cipher, s, { now: at("2031-07-01T08:02:00Z") });
    expect(sent.filter((m) => m.to === "lasciato@example.test")).toHaveLength(1);
    expect((await rowOf(id)).status).toBe("SENT");
    await dispatchMessages(db, cipher, s, { now: at("2031-07-01T09:00:00Z") });
    expect(sent.filter((m) => m.to === "lasciato@example.test")).toHaveLength(1);
  });

  it("a provider down: retried with growing waits, then given up and emptied", async () => {
    const id = await queue("guasto@example.test", at("2031-08-01T08:00:00Z"));
    const { senders: down } = senders(true);
    let now = at("2031-08-01T08:05:00Z");
    for (let i = 0; i < 3; i += 1) {
      await dispatchMessages(db, cipher, down, { now, maxAttempts: 3 });
      now = new Date(now.getTime() + 3_600_000);
    }
    const row = await rowOf(id);
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(3);
    expect(row.lastErrorCode).toBe("Error");
    expect(row.contentEnc).toBe("");
  });
});

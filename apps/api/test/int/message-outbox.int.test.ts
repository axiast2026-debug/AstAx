import { randomUUID } from "node:crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotificationService } from "../../src/notifications/notification.service.js";
import { startHarness, type Harness } from "./fixtures.js";

// Phase 8: an email of a notification is queued in MessageOutbox with the
// change, then sent after the commit and marked (the worker sends what is left).
let h: Harness;

beforeAll(async () => {
  h = await startHarness();
});

afterAll(async () => {
  await h.close();
});

describe("phase 8 notifications through MessageOutbox", () => {
  it("queued in the transaction, sent after the commit, then marked and emptied", async () => {
    const notifications = h.app.get(NotificationService);
    const ticketCode = `T-${randomUUID().slice(0, 8)}`;
    const user = {
      userId: randomUUID(),
      locale: "it" as const,
      email: "anna.riva@example.test",
      phone: null,
    };
    const outbound = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      notifications.deliver(
        tx,
        [user],
        "support.reply",
        () => ({ codice: ticketCode, testo: "Ciao" }),
        null,
        {
          ticketCode,
        },
      ),
    );
    expect(outbound).toHaveLength(1);
    const id = outbound[0]?.outboxId ?? "";
    const queued = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.messageOutbox.findUniqueOrThrow({ where: { id } }),
    );
    expect(queued).toMatchObject({
      status: "PENDING",
      channel: "EMAIL",
      eventKey: "support.reply",
    });
    expect(queued.contentEnc).not.toContain("anna.riva");

    await notifications.send(outbound);
    expect(h.email.sent.some((m) => m.subject.includes(ticketCode))).toBe(true);
    const sent = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.messageOutbox.findUniqueOrThrow({ where: { id } }),
    );
    expect(sent).toMatchObject({ status: "SENT", contentEnc: "" });
  });
});

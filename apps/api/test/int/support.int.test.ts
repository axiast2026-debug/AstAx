import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 06 «Assistenza» (decision E: an internal register): a ticket
// with its due time, ready replies in the person's language, the reply sent
// by email, internal notes that stay inside, the status.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let support: Who;

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "bo-support");
  support = { token: await h.tokenFor("bo-support"), context: membershipId("bo-support", "astax") };
});

afterAll(async () => {
  await h.close();
});

interface Detail {
  code: string;
  status: string;
  dueAt: string;
  messages: { kind: string; text: string }[];
  readyReplies: { code: string; text: string }[];
}

describe("phase 7 support tickets", () => {
  it("opens, replies by email, keeps notes inside and closes", async () => {
    const opened = await r.json<{ id: string; code: string; dueAt: string }>(
      await r.call(support, "/back-office/tickets", {
        body: {
          subject: "Non riesco a caricare il libretto",
          channel: "EMAIL",
          text: "Il caricamento si ferma a metà.",
          contactEmail: "cliente.assistenza@example.test",
          locale: "sq",
        },
      }),
      201,
    );
    expect(opened.code).toMatch(/^T-\d{6}$/);
    // support.responseHours (24) from now.
    expect(new Date(opened.dueAt).getTime() - h.clock.now().getTime()).toBe(24 * 3_600_000);

    const detail = await r.json<Detail>(
      await r.call(support, `/back-office/tickets/${opened.id}`),
      200,
    );
    // The ready replies come in the person's language.
    expect(detail.readyReplies.find((x) => x.code === "RECEIVED")?.text).toContain("E kemi marrë");

    const before = h.email.sent.length;
    await r.json(
      await r.call(support, `/back-office/tickets/${opened.id}/messages`, {
        body: { kind: "NOTE", text: "Probabile file troppo grande." },
      }),
      201,
    );
    expect(h.email.sent.length).toBe(before);
    await r.json(
      await r.call(support, `/back-office/tickets/${opened.id}/messages`, {
        body: { kind: "REPLY", text: "Prova con un file sotto i 10 MB." },
      }),
      201,
    );
    const mail = h.email.sent.at(-1);
    expect(mail?.to).toBe("cliente.assistenza@example.test");
    expect(mail?.subject).toContain(opened.code);
    expect(mail?.text).toContain("Prova con un file sotto i 10 MB.");
    expect(mail?.text).not.toContain("Probabile file troppo grande.");

    const after = await r.json<Detail>(
      await r.call(support, `/back-office/tickets/${opened.id}`),
      200,
    );
    expect(after.status).toBe("WAITING_CUSTOMER");
    expect(after.messages.map((m) => m.kind)).toEqual(["INBOUND", "NOTE", "REPLY"]);

    await r.json(
      await r.call(support, `/back-office/tickets/${opened.id}/status`, {
        body: { status: "CLOSED" },
      }),
      200,
    );
    const closed = await r.call(support, `/back-office/tickets/${opened.id}/messages`, {
      body: { kind: "NOTE", text: "Ancora" },
    });
    expect(closed.status).toBe(409);
  });

  it("a phone ticket cannot be answered by email", async () => {
    const opened = await r.json<{ id: string }>(
      await r.call(support, "/back-office/tickets", {
        body: { subject: "Telefonata", channel: "PHONE", text: "Chiede lo stato della polizza." },
      }),
      201,
    );
    const reply = await r.call(support, `/back-office/tickets/${opened.id}/messages`, {
      body: { kind: "REPLY", text: "Risposta" },
    });
    expect(reply.status).toBe(400);
  });

  it("the verifier has no access to the tickets", async () => {
    await acceptAllLegal(h, "bo-verifier");
    const verifier: Who = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    expect((await r.call(verifier, "/back-office/tickets")).status).toBe(403);
  });
});

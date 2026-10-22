import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, userId, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 07 «Comunicazioni»: the texts edited with a version and a
// reason and used at once; the preview; the test to oneself; the
// messages to a group.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let admin: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "admin");
  admin = { token: await h.tokenFor("admin"), context: membershipId("admin", "astax") };
});

afterAll(async () => {
  await h.close();
});

interface Template {
  eventKey: string;
  version: number;
  variables: string[];
  it: Record<string, string>;
}

describe("phase 7 the texts of the notifications", () => {
  it("an edit makes a new version, with a reason, and refuses an unknown variable", async () => {
    const list = await r.json<Template[]>(
      await r.call(admin, "/admin/notification-templates"),
      200,
    );
    const t = list.find((x) => x.eventKey === "communication.message");
    expect(t?.variables).toEqual(["titolo", "testo"]);
    const bad = await r.json<{ errors: { issue: string }[] }>(
      await r.call(admin, "/admin/notification-templates/communication.message", {
        method: "PUT",
        body: {
          it: { ...t?.it, body: "{{testo}} per {{nome}}" },
          reason: "Prova",
        },
      }),
      400,
    );
    expect(bad.errors[0]?.issue).toBe("UNKNOWN_VARIABLE:nome");
    const ok = await r.json<{ version: number }>(
      await r.call(admin, "/admin/notification-templates/communication.message", {
        method: "PUT",
        body: {
          it: { ...t?.it, body: "Avviso: {{testo}}" },
          reason: "Testo più chiaro",
        },
      }),
      200,
    );
    expect(ok.version).toBe((t?.version ?? 0) + 1);
    const history = await r.json<{ version: number; reason: string }[]>(
      await r.call(admin, "/admin/notification-templates/communication.message/history"),
      200,
    );
    expect(history[0]).toMatchObject({ version: ok.version, reason: "Testo più chiaro" });
  });

  it("the preview with sample values, in Italian only (ADR 0017)", async () => {
    const it = await r.json<{ body: string }>(
      await r.call(admin, "/admin/notification-templates/communication.message/preview", {
        body: {},
      }),
      200,
    );
    expect(it.body).toBe("Avviso: «testo»");
    // A language is no longer a field of the preview.
    await r.json(
      await r.call(admin, "/admin/notification-templates/request.submitted.bo/preview", {
        body: { locale: "sq" },
      }),
      400,
    );
  });

  it("the test reaches oneself, with the new text", async () => {
    const before = h.email.sent.length;
    const out = await r.json<{ sent: string[] }>(
      await r.call(admin, "/admin/notification-templates/communication.message/test", { body: {} }),
      200,
    );
    expect(out.sent).toContain("EMAIL");
    const note = await system((tx) =>
      tx.notification.findFirst({
        where: { userId: userId("admin"), eventKey: "communication.message" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(note?.body).toBe("Avviso: «testo»");
    expect(h.email.sent.length).toBe(before + 1);
  });

  it("a message to the brokers reaches every active broker user, not the others", async () => {
    const out = await r.json<{ id: string; recipients: number }>(
      await r.call(admin, "/admin/communications", {
        body: {
          group: "BROKER",
          title: "Novità",
          text: "Da lunedì nuova pagina dei rinnovi",
          reason: "Comunicazione ai broker",
        },
      }),
      201,
    );
    expect(out.recipients).toBeGreaterThan(0);
    const notes = await system((tx) =>
      tx.notification.findMany({
        where: {
          eventKey: "communication.message",
          payload: { path: ["communicationId"], equals: out.id },
        },
      }),
    );
    expect(notes.length).toBe(out.recipients);
    expect(notes.some((n) => n.userId === userId("broker-owner"))).toBe(true);
    expect(notes.some((n) => n.userId === userId("agenzia-uno-owner"))).toBe(false);
  });
});

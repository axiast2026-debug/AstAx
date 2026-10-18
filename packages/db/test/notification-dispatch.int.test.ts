import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DUPLICATE_WINDOW_MS,
  planDispatch,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type StoredTemplate,
} from "../src/index.js";
import { appDb } from "./fixtures.js";

// Phase 7, docs/notifiche.md: who gets an event on which channel.
let db: DbClient;
const now = new Date("2026-11-16T09:00:00.000Z");

beforeAll(() => {
  db = appDb();
});

afterAll(async () => {
  await db.$disconnect();
});

const template = (over: Partial<StoredTemplate> = {}): StoredTemplate => ({
  eventKey: `test.event.${randomUUID().slice(0, 8)}`,
  version: 1,
  recipients: [],
  channels: ["IN_APP", "EMAIL", "PUSH"],
  mandatory: false,
  forcePush: false,
  variables: [],
  it: { title: "T", body: "B", emailSubject: "S", emailBody: "E" },
  ...over,
});

const user = () => ({
  userId: randomUUID(),
  locale: "it" as const,
  email: "test@example.test",
  phone: null,
});

const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(db, SYSTEM_CONTEXT, work);

describe("phase 7 planDispatch", () => {
  it("the user's choice switches a channel off; in app always stays", async () => {
    const t = template();
    const u = user();
    await system((tx) =>
      tx.notificationPreference.create({
        data: { userId: u.userId, eventKey: t.eventKey, channel: "EMAIL", enabled: false },
      }),
    );
    const plan = await system((tx) => planDispatch(tx, t, [u], { id: "1" }, { now }));
    expect(plan.inApp).toHaveLength(1);
    expect(plan.email).toHaveLength(0);
  });

  it("a mandatory event ignores the choices; forcePush keeps the push", async () => {
    const mandatory = template({ mandatory: true });
    const forced = template({ forcePush: true });
    const u = user();
    await system(async (tx) => {
      for (const t of [mandatory, forced]) {
        for (const channel of ["EMAIL", "PUSH"] as const) {
          await tx.notificationPreference.create({
            data: { userId: u.userId, eventKey: t.eventKey, channel, enabled: false },
          });
        }
      }
      await tx.pushSubscription.create({
        data: { userId: u.userId, endpointHash: randomUUID(), subscriptionEnc: "enc" },
      });
    });
    const a = await system((tx) => planDispatch(tx, mandatory, [u], { id: "1" }, { now }));
    expect(a.email).toHaveLength(1);
    expect(a.push).toHaveLength(1);
    const b = await system((tx) => planDispatch(tx, forced, [u], { id: "1" }, { now }));
    expect(b.email).toHaveLength(0);
    expect(b.push).toEqual([{ user: u, subscriptions: ["enc"] }]);
  });

  it("no duplicates: the same event again within the window sends nothing, later it does", async () => {
    const t = template();
    const u = user();
    const first = await system((tx) => planDispatch(tx, t, [u, u], { id: "7" }, { now }));
    expect(first.inApp).toHaveLength(1);
    expect(first.email).toHaveLength(1);
    const again = await system((tx) =>
      planDispatch(tx, t, [u], { id: "7" }, { now: new Date(now.getTime() + 60_000) }),
    );
    expect(again.inApp).toHaveLength(0);
    expect(again.email).toHaveLength(0);
    const other = await system((tx) => planDispatch(tx, t, [u], { id: "8" }, { now }));
    expect(other.inApp).toHaveLength(1);
    const later = await system((tx) =>
      planDispatch(
        tx,
        t,
        [u],
        { id: "7" },
        {
          now: new Date(now.getTime() + DUPLICATE_WINDOW_MS + 1000),
        },
      ),
    );
    expect(later.inApp).toHaveLength(1);
  });

  it("a channel the event does not have is never used", async () => {
    const t = template({ channels: ["EMAIL"] });
    const plan = await system((tx) => planDispatch(tx, t, [user()], { id: "1" }, { now }));
    expect(plan.inApp).toHaveLength(0);
    expect(plan.email).toHaveLength(1);
  });
});

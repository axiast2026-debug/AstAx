import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asSystem, withContext, type DbClient, type DbTransaction } from "../src/index.js";
import { appDb, asPrivate } from "./fixtures.js";

// Rule 3: the system context of asSystem is given back to the caller only when
// the last of overlapping calls ends (bug found in phase 6: «Da emettere» read
// four things at once and the uploaded documents went missing at random).
let db: DbClient;

beforeAll(() => {
  db = appDb();
});

afterAll(async () => {
  await db.$disconnect();
});

const isSystem = async (tx: DbTransaction) =>
  (
    await tx.$queryRaw<{ value: string }[]>`
      SELECT coalesce(current_setting('app.is_system', true), 'false') AS value`
  )[0]?.value;

describe("asSystem", () => {
  it("overlapping calls on one transaction stay system until the last one ends", async () => {
    const seen = await withContext(db, asPrivate(randomUUID()), async (tx) => {
      // The first call is under way (its setting taken) when the second starts;
      // the first ends while the second is still reading.
      const first = asSystem(tx, async () => {
        await tx.$executeRaw`SELECT pg_sleep(0.02)`;
        return isSystem(tx);
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = asSystem(tx, async () => {
        await tx.$executeRaw`SELECT pg_sleep(0.08)`;
        return isSystem(tx);
      });
      const [, late] = await Promise.all([first, second]);
      return { late, after: await isSystem(tx) };
    });
    expect(seen).toEqual({ late: "true", after: "false" });
  });

  it("nested calls give back the caller's context, also after an error", async () => {
    const after = await withContext(db, asPrivate(randomUUID()), async (tx) => {
      await asSystem(tx, async () => {
        await asSystem(tx, async () => undefined);
        expect(await isSystem(tx)).toBe("true");
      });
      await asSystem(tx, async () => {
        throw new Error("boom");
      }).catch(() => undefined);
      return isSystem(tx);
    });
    expect(after).toBe("false");
  });
});

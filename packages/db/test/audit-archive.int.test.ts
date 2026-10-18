import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { archiveAuditLog } from "../src/audit-archive.js";
import { appendAudit } from "../src/audit.js";
import type { DbClient } from "../src/client.js";
import { SYSTEM_CONTEXT, withContext } from "../src/context.js";
import { appDb } from "./fixtures.js";

// SIC-04, phase 8: the copies of the audit log in the archive nobody can change.
let db: DbClient;

beforeAll(() => {
  db = appDb();
});

afterAll(async () => {
  await db.$disconnect();
});

const entry = (action: string) => ({
  at: new Date("2031-09-01T10:00:00Z"),
  actorUserId: null,
  actorMembershipId: null,
  actorOrganizationId: null,
  action,
  targetType: "Test",
  targetId: "archive",
  before: null,
  after: null,
  reason: null,
  ip: null,
  userAgent: null,
});

describe("SIC-04 audit archive", () => {
  it("copies every entry once, with its hashes, in files named by sequence", async () => {
    const files = new Map<string, string>();
    const put = async (key: string, body: Uint8Array) => {
      files.set(key, new TextDecoder().decode(body));
    };
    const now = new Date("2031-09-01T10:05:00Z");
    // Whatever earlier test files wrote is copied first.
    await archiveAuditLog(db, put, now);
    files.clear();

    await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      await appendAudit(tx, entry("ARCHIVE_TEST_1"));
      await appendAudit(tx, entry("ARCHIVE_TEST_2"));
    });
    expect(await archiveAuditLog(db, put, now)).toEqual({ entries: 2, files: 1 });
    const [key, body] = [...files][0] ?? ["", ""];
    expect(key).toMatch(/^audit\/2031\/09\/01\/\d+-\d+\.jsonl$/);
    const lines = body
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.map((l) => l.action)).toEqual(["ARCHIVE_TEST_1", "ARCHIVE_TEST_2"]);
    expect(lines[1]?.prevHash).toBe(lines[0]?.hash);

    // Nothing new: nothing written.
    expect(await archiveAuditLog(db, put, now)).toEqual({ entries: 0, files: 0 });
  });

  it("a failed write keeps the cursor: the same entries go out next time", async () => {
    await withContext(db, SYSTEM_CONTEXT, (tx) => appendAudit(tx, entry("ARCHIVE_TEST_3")));
    const now = new Date("2031-09-02T10:00:00Z");
    await expect(
      archiveAuditLog(db, async () => Promise.reject(new Error("storage down")), now),
    ).rejects.toThrow("storage down");
    const written: string[] = [];
    await archiveAuditLog(
      db,
      async (_key, body) => {
        written.push(new TextDecoder().decode(body));
      },
      now,
    );
    expect(written.join("")).toContain("ARCHIVE_TEST_3");
  });
});

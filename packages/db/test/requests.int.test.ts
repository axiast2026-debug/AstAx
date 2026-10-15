import { LocalFieldCipher } from "@astax/adapters/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_CONTEXT, withContext, type DbClient, type DbTransaction } from "../src/index.js";
import { appDb, asMember, asPrivate, createWorld, type World } from "./fixtures.js";

// Fase 2, ADR 0007: customers and requests belong to a private user or to an
// organization; the database enforces it as a second line after the API.
const cipher = new LocalFieldCipher("3".repeat(64), "4".repeat(64));
const FISCAL_CODE = "NREGLI90E52F205X";

let db: DbClient;
let w: World;
let otherPrivate: string;

type Owner = { ownerUserId: string } | { ownerOrganizationId: string };

async function createRequest(
  tx: DbTransaction,
  owner: Owner,
  requesterUserId: string,
  code: string,
) {
  const person = await tx.person.create({
    data: {
      ...owner,
      kind: "PERSON",
      surname: "Neri",
      givenName: "Giulia",
      fiscalCodeEnc: cipher.encrypt(FISCAL_CODE),
      fiscalCodeHash: cipher.blindIndex("fiscalCode", FISCAL_CODE),
    },
  });
  const customer = await tx.customer.create({
    data: {
      ...owner,
      personId: person.id,
      emailEnc: cipher.encrypt("giulia.neri@example.test"),
      emailHash: cipher.blindIndex("email", "giulia.neri@example.test"),
      phoneEnc: cipher.encrypt("+39 333 000 0001"),
      phoneHash: cipher.blindIndex("phone", "+39 333 000 0001"),
    },
  });
  return tx.quoteRequest.create({
    data: {
      ...owner,
      code,
      channel: "ownerUserId" in owner ? "PRIVATE" : "BROKER",
      requesterUserId,
      customerId: customer.id,
      draftEnc: cipher.encrypt("{}"),
    },
  });
}

let privateRequestId: string;
let brokerRequestId: string;
const tag = Math.random().toString(36).slice(2, 8).toUpperCase();

beforeAll(async () => {
  db = appDb();
  w = await createWorld(db);
  otherPrivate = await withContext(
    db,
    SYSTEM_CONTEXT,
    async (tx) =>
      (await tx.user.create({ data: { kind: "PRIVATE", firstName: "Altro", lastName: "Privato" } }))
        .id,
  );
  privateRequestId = (
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      createRequest(tx, { ownerUserId: w.giuliaNeri }, w.giuliaNeri, `T-${tag}-1`),
    )
  ).id;
  brokerRequestId = (
    await withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
      createRequest(tx, { ownerOrganizationId: w.agenziaUno }, w.ownerUno, `T-${tag}-2`),
    )
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("fase 2: customers and requests, row level security", () => {
  it("a private user sees only their own requests and customers", async () => {
    await withContext(db, asPrivate(w.giuliaNeri), async (tx) => {
      const ids = (await tx.quoteRequest.findMany()).map((r) => r.id);
      expect(ids).toContain(privateRequestId);
      expect(ids).not.toContain(brokerRequestId);
    });
    await withContext(db, asPrivate(otherPrivate), async (tx) => {
      expect(await tx.quoteRequest.findMany({ where: { id: privateRequestId } })).toEqual([]);
      expect(await tx.customer.count()).toBe(0);
      expect(await tx.person.count()).toBe(0);
    });
  });

  it("a professional context sees only its organization's rows, never a private user's", async () => {
    await withContext(db, asMember(w.ownerUno, w.agenziaUno), async (tx) => {
      const ids = (await tx.quoteRequest.findMany()).map((r) => r.id);
      expect(ids).toContain(brokerRequestId);
      expect(ids).not.toContain(privateRequestId);
    });
    await withContext(db, asMember(w.ownerDue, w.agenziaDue), async (tx) => {
      expect(await tx.quoteRequest.findMany({ where: { id: brokerRequestId } })).toEqual([]);
      const changed = await tx.quoteRequest.updateMany({
        where: { id: brokerRequestId },
        data: { status: "CANCELLED" },
      });
      expect(changed.count).toBe(0);
    });
  });

  it("a user cannot create a row owned by someone else", async () => {
    await expect(
      withContext(db, asMember(w.ownerDue, w.agenziaDue), (tx) =>
        createRequest(tx, { ownerOrganizationId: w.agenziaUno }, w.ownerDue, `T-${tag}-3`),
      ),
    ).rejects.toThrow();
    await expect(
      withContext(db, asPrivate(otherPrivate), (tx) =>
        createRequest(tx, { ownerUserId: w.giuliaNeri }, otherPrivate, `T-${tag}-4`),
      ),
    ).rejects.toThrow();
  });

  it("the back office sees every request", async () => {
    await withContext(db, asMember(w.boVerifier, w.astax, true), async (tx) => {
      const ids = (await tx.quoteRequest.findMany()).map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([privateRequestId, brokerRequestId]));
    });
  });

  it("a row has exactly one kind of owner, matching the channel", async () => {
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.quoteRequest.create({
          data: {
            code: `T-${tag}-5`,
            channel: "PRIVATE",
            ownerOrganizationId: w.agenziaUno,
            requesterUserId: w.ownerUno,
          },
        }),
      ),
    ).rejects.toThrow(/quote_request_channel_owner/);
  });
});

describe("fase 2: quoteData versions and timeline are append only", () => {
  it("adds versions but refuses to change or delete them", async () => {
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.quoteDataVersion.create({
        data: {
          quoteRequestId: privateRequestId,
          ownerUserId: w.giuliaNeri,
          version: 1,
          dataEnc: cipher.encrypt('{"schemaVersion":1}'),
          dataSha256: "0".repeat(64),
          source: "SUBMISSION",
          createdByUserId: w.giuliaNeri,
        },
      }),
    );
    await expect(
      withContext(db, asMember(w.boVerifier, w.astax, true), (tx) =>
        tx.quoteDataVersion.updateMany({
          where: { quoteRequestId: privateRequestId },
          data: { reason: "x" },
        }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.quoteDataVersion.deleteMany({ where: { quoteRequestId: privateRequestId } }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuses to change the timeline", async () => {
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.quoteRequestEvent.create({
        data: {
          quoteRequestId: privateRequestId,
          ownerUserId: w.giuliaNeri,
          type: "CREATED",
          actorKind: "REQUESTER",
          actorUserId: w.giuliaNeri,
          at: new Date("2026-10-15T08:00:00.000Z"),
        },
      }),
    );
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.quoteRequestEvent.deleteMany({ where: { quoteRequestId: privateRequestId } }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("only the back office records a verification decision", async () => {
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.verification.create({
        data: {
          quoteRequestId: privateRequestId,
          ownerUserId: w.giuliaNeri,
          round: 1,
          quoteDataVersion: 1,
          autoOutcome: "GREEN",
          checklist: [],
        },
      }),
    );
    const byRequester = await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.verification.updateMany({
        where: { quoteRequestId: privateRequestId },
        data: { decision: "APPROVED" },
      }),
    );
    expect(byRequester.count).toBe(0);
    const byStaff = await withContext(db, asMember(w.boVerifier, w.astax, true), (tx) =>
      tx.verification.updateMany({
        where: { quoteRequestId: privateRequestId },
        data: { decision: "APPROVED" },
      }),
    );
    expect(byStaff.count).toBe(1);
  });
});

describe("fase 2: encryption and blind index (SIC-03)", () => {
  it("fiscal code, phone and email are stored encrypted; exact search uses the blind index", async () => {
    await withContext(db, asPrivate(w.giuliaNeri), async (tx) => {
      const person = await tx.person.findFirstOrThrow({
        where: { fiscalCodeHash: cipher.blindIndex("fiscalCode", "nregli90e52f205x") },
      });
      expect(person.fiscalCodeEnc).not.toContain(FISCAL_CODE);
      expect(cipher.decrypt(person.fiscalCodeEnc ?? "")).toBe(FISCAL_CODE);
      const customer = await tx.customer.findFirstOrThrow({ where: { personId: person.id } });
      expect(customer.emailEnc).not.toContain("example.test");
      expect(customer.phoneEnc).not.toContain("333");
      expect(
        await tx.customer.count({ where: { phoneHash: cipher.blindIndex("phone", "3330000001") } }),
      ).toBeGreaterThan(0);
    });
  });

  it("the request code number comes from one sequence", async () => {
    const [a, b] = await withContext(db, SYSTEM_CONTEXT, async (tx) => [
      await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('quote_request_number_seq') AS n`,
      await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('quote_request_number_seq') AS n`,
    ]);
    expect(Number(b?.[0]?.n) - Number(a?.[0]?.n)).toBe(1);
  });
});

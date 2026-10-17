import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isUniqueViolation, SYSTEM_CONTEXT, withContext, type DbClient } from "../src/index.js";
import { appDb, asMember, asPrivate, createWorld, type World } from "./fixtures.js";

// Phase 3, docs/busta-chiusa.md: the database is the second line of the sealed
// bid. Offers carry only sealed values until the worker closes the auction.
let db: DbClient;
let w: World;
let auctionId: string;
const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
const AT = new Date("2026-11-16T17:30:00.000Z");

const sealedOffer = (organizationId: string, userId: string, membershipId: string) => ({
  auctionId,
  organizationId,
  membershipId,
  userId,
  submittedAt: AT,
  lastChangedAt: AT,
  sealedPayload: "sealed:payload",
  ownerCopy: "owner:copy",
});

let membershipOf: (userId: string, organizationId: string) => Promise<string>;

beforeAll(async () => {
  db = appDb();
  w = await createWorld(db);
  membershipOf = (userId, organizationId) =>
    withContext(
      db,
      SYSTEM_CONTEXT,
      async (tx) =>
        (await tx.membership.findFirstOrThrow({ where: { userId, organizationId } })).id,
    );
  auctionId = await withContext(db, SYSTEM_CONTEXT, async (tx) => {
    const request = await tx.quoteRequest.create({
      data: {
        code: `T-${tag}`,
        channel: "PRIVATE",
        ownerUserId: w.giuliaNeri,
        requesterUserId: w.giuliaNeri,
        status: "AUCTION_OPEN",
      },
    });
    const auction = await tx.auction.create({
      data: {
        quoteRequestId: request.id,
        ownerUserId: w.giuliaNeri,
        kind: "MAIN",
        round: 1,
        openedAt: AT,
        scheduledCloseAt: new Date("2026-11-17T09:30:00.000Z"),
        originalCloseAt: new Date("2026-11-17T09:30:00.000Z"),
        minGuaranteeDate: new Date("2026-12-02"),
        durationHours: 2,
        settingsSnapshot: {},
        publicKey: "public",
        wrappedPrivateKey: "wrapped",
        kmsKeyRef: "fake:sealed-bids",
      },
    });
    await tx.invitation.createMany({
      data: [w.agenziaUno, w.agenziaTre].map((organizationId) => ({
        auctionId: auction.id,
        organizationId,
        source: "AUTO" as const,
        invitedAt: AT,
      })),
    });
    return auction.id;
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("phase 3: auctions and sealed offers, row level security", () => {
  it("the requester and the invited agencies see the auction; another agency does not", async () => {
    const sees = (ctx: Parameters<typeof withContext>[1]) =>
      withContext(db, ctx, (tx) => tx.auction.count({ where: { id: auctionId } }));
    expect(await sees(asPrivate(w.giuliaNeri))).toBe(1);
    expect(await sees(asMember(w.ownerUno, w.agenziaUno))).toBe(1);
    expect(await sees(asMember(w.ownerDue, w.agenziaDue))).toBe(0);
    expect(await sees(asMember(w.boVerifier, w.astax, true, "BO_VERIFIER"))).toBe(1);
  });

  it("only the worker opens or changes an auction, not the back office nor an agency", async () => {
    for (const ctx of [
      asMember(w.boVerifier, w.astax, true, "ADMIN"),
      asMember(w.ownerUno, w.agenziaUno),
    ]) {
      const changed = await withContext(db, ctx, (tx) =>
        tx.auction.updateMany({ where: { id: auctionId }, data: { status: "CLOSED" } }),
      );
      expect(changed.count).toBe(0);
    }
  });

  it("BC-02 an agency writes only sealed values: a plain premium is refused", async () => {
    const membership = await membershipOf(w.ownerUno, w.agenziaUno);
    await expect(
      withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
        tx.offer.create({
          data: {
            ...sealedOffer(w.agenziaUno, w.ownerUno, membership),
            annualGrossPremiumCents: 50500,
          },
        }),
      ),
    ).rejects.toThrow(/BC-02/);
  });

  it("BC-01 AstAx staff cannot write an offer, nor read one before the closing", async () => {
    const membership = await membershipOf(w.ownerUno, w.agenziaUno);
    await withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
      tx.offer.createMany({ data: [sealedOffer(w.agenziaUno, w.ownerUno, membership)] }),
    );
    await expect(
      withContext(db, asMember(w.boVerifier, w.astax, true, "ADMIN"), (tx) =>
        tx.offer.createMany({ data: [sealedOffer(w.agenziaUno, w.boVerifier, membership)] }),
      ),
    ).rejects.toThrow();
    const seen = (ctx: Parameters<typeof withContext>[1]) =>
      withContext(db, ctx, (tx) => tx.offer.count({ where: { auctionId } }));
    expect(await seen(asMember(w.boVerifier, w.astax, true, "ADMIN"))).toBe(0);
    expect(await seen(asMember(w.ownerDue, w.agenziaDue))).toBe(0);
    expect(await seen(asPrivate(w.giuliaNeri))).toBe(0);
    expect(await seen(asMember(w.ownerUno, w.agenziaUno))).toBe(1);
  });

  it("OFF-01 OFF-02 one offer per agency and one per person in the round", async () => {
    const marcoUno = await membershipOf(w.marcoRossi, w.agenziaUno);
    const marcoTre = await membershipOf(w.marcoRossi, w.agenziaTre);
    // Agenzia Uno has an offer already (previous test).
    await expect(
      withContext(db, asMember(w.marcoRossi, w.agenziaUno, false, "OPERATOR"), (tx) =>
        tx.offer.createMany({ data: [sealedOffer(w.agenziaUno, w.marcoRossi, marcoUno)] }),
      ),
    ).rejects.toThrow();
    await withContext(db, asMember(w.marcoRossi, w.agenziaTre, false, "OPERATOR"), (tx) =>
      tx.offer.createMany({ data: [sealedOffer(w.agenziaTre, w.marcoRossi, marcoTre)] }),
    );
    // Marco offered for Tre: he cannot offer again in the round, for any agency.
    await withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
      tx.offer.updateMany({ where: { auctionId }, data: { status: "WITHDRAWN" } }),
    );
    await expect(
      withContext(db, asMember(w.marcoRossi, w.agenziaUno, false, "OPERATOR"), (tx) =>
        tx.offer.createMany({ data: [sealedOffer(w.agenziaUno, w.marcoRossi, marcoUno)] }),
      ),
    ).rejects.toThrow();
  });

  it("OFF-03 one active claim per person in the auction, recognized as a unique violation", async () => {
    const marcoUno = await membershipOf(w.marcoRossi, w.agenziaUno);
    const marcoTre = await membershipOf(w.marcoRossi, w.agenziaTre);
    const claim = (organizationId: string, membershipId: string) => ({
      auctionId,
      organizationId,
      membershipId,
      userId: w.marcoRossi,
      claimedAt: new Date("2026-11-16T09:00:00.000Z"),
    });
    const error = await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      await tx.claim.create({ data: claim(w.agenziaUno, marcoUno) });
      await tx.$executeRaw`SAVEPOINT second`;
      try {
        await tx.claim.create({ data: claim(w.agenziaTre, marcoTre) });
        return null;
      } catch (e) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT second`;
        await tx.claim.deleteMany({ where: { auctionId, userId: w.marcoRossi } });
        return e;
      }
    });
    expect(error).not.toBeNull();
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(new Error("other"))).toBe(false);
  });

  it("BC-05 once the auction is closing, an agency can neither submit nor change", async () => {
    await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.auction.update({ where: { id: auctionId }, data: { status: "CLOSING" } }),
    );
    await expect(
      withContext(db, asMember(w.marcoRossi, w.agenziaTre, false, "OPERATOR"), (tx) =>
        tx.offer.updateMany({ where: { auctionId }, data: { status: "WITHDRAWN" } }),
      ),
    ).rejects.toThrow(/BC-05/);
    const ownerUno = await membershipOf(w.ownerUno, w.agenziaUno);
    await expect(
      withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
        tx.offer.createMany({ data: [sealedOffer(w.agenziaUno, w.ownerUno, ownerUno)] }),
      ),
    ).rejects.toThrow(/BC-05/);
  });

  it("sealed versions of an offer cannot be changed", async () => {
    const offer = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.offer.findFirstOrThrow({ where: { auctionId, organizationId: w.agenziaTre } }),
    );
    await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.offerVersion.create({
        data: {
          offerId: offer.id,
          organizationId: w.agenziaTre,
          version: 1,
          sealedPayload: "sealed:v1",
        },
      }),
    );
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.offerVersion.updateMany({ where: { offerId: offer.id }, data: { sealedPayload: "x" } }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

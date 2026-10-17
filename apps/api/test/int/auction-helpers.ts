import { randomUUID } from "node:crypto";
import { generateAuctionKeyPair, KMS_KEYS, LocalKms, wipe } from "@astax/adapters/kms";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { orgId, type Harness } from "./fixtures.js";

/** The auction as the worker opens it: key pair, wrapped private key, invitations. */
export async function openTestAuction(
  h: Harness,
  id: string,
  agencies: string[],
  options: { kind?: "MAIN" | "RECONFIRMATION"; round?: number } = {},
) {
  const kms = new LocalKms({ [KMS_KEYS.sealedBids]: "5".repeat(64) });
  const auction = randomUUID();
  const keys = await generateAuctionKeyPair();
  const wrapped = await kms.encrypt(KMS_KEYS.sealedBids, keys.privateKey, {
    purpose: "sealed-bid",
    auctionId: auction,
  });
  await wipe(keys.privateKey);
  const now = h.clock.now();
  await withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
    const request = await tx.quoteRequest.update({
      where: { id },
      data: { status: options.kind === "RECONFIRMATION" ? "IN_RECONFIRMATION" : "AUCTION_OPEN" },
    });
    await tx.auction.create({
      data: {
        id: auction,
        quoteRequestId: id,
        ownerUserId: request.ownerUserId,
        ownerOrganizationId: request.ownerOrganizationId,
        kind: options.kind ?? "MAIN",
        round: options.round ?? 1,
        openedAt: now,
        scheduledCloseAt: new Date(now.getTime() + 2 * 3_600_000),
        originalCloseAt: new Date(now.getTime() + 2 * 3_600_000),
        minGuaranteeDate: new Date("2026-12-01"),
        durationHours: 2,
        settingsSnapshot: {
          "calendar.workingHours": {
            mon: [["09:00", "19:00"]],
            tue: [["09:00", "19:00"]],
            wed: [["09:00", "19:00"]],
            thu: [["09:00", "19:00"]],
            fri: [["09:00", "19:00"]],
            sat: [["09:00", "13:00"]],
            sun: [],
          },
          "auction.closingReminderMinutes": 60,
          "invitations.topUp.checkAtFraction": 0.5,
          "invitations.topUp.minOffers": 3,
          "invitations.topUp.extra": 4,
          "invitations.backOfficeWindowFraction": 0.5,
          "invitations.max": 8,
          "invitations.minReceptionOverlapWorkingHours": 1,
        },
        publicKey: keys.publicKey,
        wrappedPrivateKey: wrapped,
        kmsKeyRef: KMS_KEYS.sealedBids,
      },
    });
    await tx.invitation.createMany({
      data: agencies.map((a) => ({
        auctionId: auction,
        organizationId: orgId(a),
        source: "AUTO" as const,
        invitedAt: now,
      })),
    });
  });
  return auction;
}

/**
 * A closed round with its valid offers, as the worker leaves it (phase 5):
 * plain values, statuses «In attesa del cliente», the ranking, the request
 * «Offerte disponibili».
 */
export async function closedRound(
  h: Harness,
  requestId: string,
  offers: { agency: string; company: string; cents: number; until: string; at: string }[],
) {
  const auctionId = await openTestAuction(
    h,
    requestId,
    offers.map((o) => o.agency),
  );
  const ids = await withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
    const created: string[] = [];
    for (const o of offers) {
      const organizationId = orgId(o.agency);
      const product = await tx.insuranceProduct.findFirstOrThrow({
        where: { organizationId, company: { name: o.company } },
      });
      const owner = await tx.membership.findFirstOrThrow({
        where: { organizationId, role: "OWNER" },
      });
      const offer = await tx.offer.create({
        data: {
          auctionId,
          organizationId,
          membershipId: owner.id,
          userId: owner.userId,
          submittedAt: new Date(o.at),
          lastChangedAt: new Date(o.at),
          sealedPayload: "sealed",
          ownerCopy: "copy",
          status: "AWAITING_CUSTOMER",
          annualGrossPremiumCents: o.cents,
          companyId: product.companyId,
          productId: product.id,
          coverage: {
            rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
            recourseWaiver: { included: false },
            roadsideAssistance: { included: false },
            legalProtection: { included: false },
            driverAccident: { included: false },
            theftFire: { included: false },
            naturalEventsVandalism: { included: false },
            glass: { included: false },
          },
          guaranteeUntil: new Date(o.until),
        },
      });
      created.push(offer.id);
    }
    const sorted = offers
      .map((o, i) => ({ ...o, id: created[i] as string }))
      .sort(
        (a, b) => a.cents - b.cents || b.until.localeCompare(a.until) || a.at.localeCompare(b.at),
      );
    for (const [i, o] of sorted.entries()) {
      await tx.offer.update({ where: { id: o.id }, data: { rank: i + 1 } });
    }
    await tx.ranking.create({
      data: {
        quoteRequestId: requestId,
        auctionId,
        entries: sorted.map((o, i) => ({
          offerId: o.id,
          organizationId: orgId(o.agency),
          rank: i + 1,
          annualGrossPremiumCents: o.cents,
        })),
        validCount: sorted.length,
      },
    });
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: "CLOSED", closedAt: h.clock.now() },
    });
    await tx.quoteRequest.update({
      where: { id: requestId },
      data: { status: "OFFERS_AVAILABLE" },
    });
    return created;
  });
  return { auctionId, offerIds: ids };
}

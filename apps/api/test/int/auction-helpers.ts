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

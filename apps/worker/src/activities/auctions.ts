import { createHash, randomUUID } from "node:crypto";
import {
  decryptFile,
  generateAuctionKeyPair,
  KMS_KEYS,
  openSealed,
  wipe,
} from "@astax/adapters/kms";
import {
  addRequestEvent,
  auctionSettings,
  auctionSettingsAt,
  filterableRequest,
  loadAgencyCandidates,
  loadWorkingCalendar,
  reconfirmationAsked,
  recordDomainEvent,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type Auction,
  type DbTransaction,
  type Prisma,
  type QuoteRequest,
  requestRequirements,
} from "@astax/db";
import {
  addWorkingMinutes,
  auctionTimes,
  backOfficeMayInvite,
  coverageShortfalls,
  guaranteeDateAccepted,
  OfferPayloadSchema,
  rankOffers,
  selectAgencies,
  topUpSize,
  transitionOffer,
  transitionRequest,
  type OfferPayload,
  type RequestStatus,
} from "@astax/shared/domain";
import {
  calendarDateToDbDate,
  dbDateToCalendarDate,
  formatDate,
  formatDateTime,
  formatEuroCents,
} from "@astax/shared/format";
import { startForNotice } from "@astax/shared/notifications";
import { errorForLog } from "@astax/shared/logging";
import { ApplicationFailure } from "@temporalio/activity";
import type { PendingEmail } from "../notifier.js";
import {
  agencyRecipients,
  audit,
  calendarOf,
  quoteDataOf,
  requesterLink,
  requesterOf,
  roundTimesOf,
  snapshotOf,
  staffRecipients,
  vehicleForAgency,
  vehicleForRequester,
  type ActivityDeps,
} from "./support.js";
import type {
  AuctionActivities,
  BackOfficeAction,
  CloseResult,
  OpenResult,
  RoundKind,
} from "./types.js";

const LONG_TX = { timeoutMs: 60_000 };

/**
 * The activities of QuoteRequestWorkflow for auctions (ADR 0008). Each runs in
 * a system transaction, checks the state before acting (a repetition by
 * Temporal changes nothing) and sends emails only after the commit.
 */
/** Phase 8, load criterion: a closing later than this after its time is an alarm. */
const CLOSE_DELAY_ALARM_MS = 5_000;

export function auctionActivities(
  deps: ActivityDeps,
): Omit<
  AuctionActivities,
  | "guaranteeSchedule"
  | "sendGuaranteeReminder"
  | "expireRequest"
  | "expiredSchedule"
  | "autoCancelExpired"
  | "reviewQuotes"
  | "issuanceSchedule"
  | "sendIssuanceReminder"
  | "issuanceSteps"
  | "runIssuanceStep"
  | "policySteps"
  | "runPolicyStep"
> {
  const { db, kms, clock, cipher, notifier, urls } = deps;

  async function inSystem<T>(work: (tx: DbTransaction, pending: PendingEmail[]) => Promise<T>) {
    const pending: PendingEmail[] = [];
    const result = await withContext(db, SYSTEM_CONTEXT, (tx) => work(tx, pending), LONG_TX);
    await notifier.flush(pending);
    return result;
  }

  async function lockAuction(tx: DbTransaction, auctionId: string): Promise<Auction> {
    await tx.$queryRaw`SELECT 1 FROM "Auction" WHERE "id" = ${auctionId}::uuid FOR UPDATE`;
    return tx.auction.findUniqueOrThrow({ where: { id: auctionId } });
  }

  async function setRequestStatus(tx: DbTransaction, request: QuoteRequest, to: RequestStatus) {
    if (request.status === to) return;
    transitionRequest(request.status as RequestStatus, to);
    await tx.quoteRequest.update({ where: { id: request.id }, data: { status: to } });
  }

  async function publish(requestId: string) {
    try {
      await deps.publish({ type: "AUCTION_CHANGED", requestId });
    } catch (error) {
      deps.logger.warn({ requestId, err: errorForLog(error) }, "realtime event not published");
    }
  }

  /** Invitations, with the in-app notification and the email to the agency's members. */
  async function invite(
    tx: DbTransaction,
    pending: PendingEmail[],
    auction: Auction,
    request: QuoteRequest,
    organizationIds: readonly string[],
    source: "AUTO" | "TOP_UP" | "BACK_OFFICE" | "REOPEN" | "RENEWAL",
    invitedByUserId: string | null,
  ) {
    const now = clock.now();
    await tx.invitation.createMany({
      data: organizationIds.map((organizationId) => ({
        auctionId: auction.id,
        organizationId,
        source,
        invitedAt: now,
        invitedByUserId,
      })),
      skipDuplicates: true,
    });
    const quoteData = await quoteDataOf(tx, cipher, request);
    const pkg = await tx.coveragePackage.findUnique({ where: { code: request.packageCode ?? "" } });
    await notifier.notify(
      tx,
      pending,
      await agencyRecipients(tx, cipher, organizationIds),
      "auction.invited",
      (locale) => ({
        codice: request.code,
        veicolo: vehicleForAgency(quoteData),
        provincia: request.province ?? "",
        pacchetto: pkg?.name ?? request.packageCode ?? "",
        decorrenza: request.startDate
          ? startForNotice(
              { startMode: request.startMode, startDate: dbDateToCalendarDate(request.startDate) },
              (key) => notifier.label(key, locale),
            )
          : "",
        garanzia_minima: formatDate(dbDateToCalendarDate(auction.minGuaranteeDate)),
        ora_chiusura: formatDateTime(auction.scheduledCloseAt),
        link: `${urls.web}/richieste-in-arrivo`,
      }),
      `/richieste-in-arrivo`,
      { auctionId: auction.id },
    );
  }

  /**
   * GAR-07, BC-06: the reconfirmation round. Invited are the agencies that had a
   * valid offer in the last closed round (now expired); same data, a new key
   * pair, reconfirmation.workingHours to answer, and a new minimum guarantee
   * computed on the closing of this round (GAR-01). Every reconfirmation counts
   * against reconfirmation.maxPerRequest (GAR-06).
   */
  async function openReconfirmation(
    tx: DbTransaction,
    pending: PendingEmail[],
    request: QuoteRequest,
    rounds: (Auction & { invitations: { organizationId: string }[] })[],
    now: Date,
  ): Promise<OpenResult> {
    const last = rounds.at(-1);
    // A repetition finds the round it already opened.
    if (last?.kind === "RECONFIRMATION" && last.status === "OPEN") {
      const calendar = await calendarOf(tx, last);
      return { opened: true, invited: last.invitations.length, ...roundTimesOf(last, calendar) };
    }
    const { "reconfirmation.maxPerRequest": max } = await settingsAt(
      tx,
      ["reconfirmation.maxPerRequest"],
      now,
    );
    if (request.status !== "EXPIRED" || request.reconfirmationsUsed >= max) {
      return { opened: false, reason: "NOT_RECONFIRMABLE" };
    }
    // The signal may arrive twice (at-least-once delivery): only a request of the
    // requester for this very reconfirmation (by count, not by time) opens one.
    if (!(await reconfirmationAsked(tx, request.id, request.reconfirmationsUsed))) {
      return { opened: false, reason: "NOT_RECONFIRMABLE" };
    }
    const lastClosed = [...rounds].reverse().find((r) => r.status === "CLOSED");
    const expired = lastClosed
      ? await tx.offer.findMany({ where: { auctionId: lastClosed.id, status: "EXPIRED" } })
      : [];
    const exclusions = await tx.invitationExclusion.findMany({
      where: { quoteRequestId: request.id },
    });
    const active = await tx.organization.findMany({
      where: {
        id: { in: [...new Set(expired.map((o) => o.organizationId))] },
        type: "AGENCY",
        status: "ACTIVE",
      },
    });
    const organizationIds = active
      .map((o) => o.id)
      .filter((id) => !exclusions.some((e) => e.organizationId === id));

    const snapshot = await auctionSettingsAt(tx, now);
    const settings = auctionSettings(snapshot);
    const calendar = await loadWorkingCalendar(tx, snapshot["calendar.workingHours"]);
    const durationHours = snapshot["reconfirmation.workingHours"];
    if (request.minValidityDays === null) {
      throw ApplicationFailure.nonRetryable("The request has no submitted data");
    }
    if (organizationIds.length === 0) {
      // Nobody to ask: the reconfirmation is not counted and the request is «Deserta».
      transitionRequest("EXPIRED", "IN_RECONFIRMATION");
      await tx.quoteRequest.update({
        where: { id: request.id },
        data: { status: "IN_RECONFIRMATION" },
      });
      return { opened: false, reason: "NO_AGENCIES" };
    }
    const times = auctionTimes(calendar, now, durationHours, request.minValidityDays, settings);
    const auctionId = randomUUID();
    const keys = await generateAuctionKeyPair();
    const wrappedPrivateKey = await kms.encrypt(KMS_KEYS.sealedBids, keys.privateKey, {
      purpose: "sealed-bid",
      auctionId,
    });
    await wipe(keys.privateKey);
    const auction = await tx.auction.create({
      data: {
        id: auctionId,
        quoteRequestId: request.id,
        ownerUserId: request.ownerUserId,
        ownerOrganizationId: request.ownerOrganizationId,
        kind: "RECONFIRMATION",
        round: (last?.round ?? 0) + 1,
        openedAt: now,
        scheduledCloseAt: times.scheduledCloseAt,
        originalCloseAt: times.scheduledCloseAt,
        minGuaranteeDate: calendarDateToDbDate(times.minGuaranteeDate),
        durationHours,
        settingsSnapshot: { ...snapshot, "calendar.holidays": [...calendar.holidays].sort() },
        publicKey: keys.publicKey,
        wrappedPrivateKey,
        kmsKeyRef: KMS_KEYS.sealedBids,
      },
    });
    await tx.invitation.createMany({
      data: organizationIds.map((organizationId) => ({
        auctionId,
        organizationId,
        source: "RECONFIRMATION" as const,
        invitedAt: now,
        invitedByUserId: null,
      })),
      skipDuplicates: true,
    });
    await setRequestStatus(tx, request, "IN_RECONFIRMATION");
    await tx.quoteRequest.update({
      where: { id: request.id },
      data: { reconfirmationsUsed: { increment: 1 } },
    });
    await addRequestEvent(tx, request, {
      type: "RECONFIRMATION_OPENED",
      actorKind: "SYSTEM",
      actorUserId: null,
      at: now,
      details: { round: auction.round, scheduledCloseAt: auction.scheduledCloseAt.toISOString() },
    });
    await recordDomainEvent(tx, {
      aggregateType: "Auction",
      aggregateId: auction.id,
      type: "AuctionOpened",
      at: now,
      actorUserId: null,
      data: { quoteRequestId: request.id, round: auction.round, invited: organizationIds.length },
    });
    await audit(tx, now, {
      action: "AUCTION_OPENED",
      targetType: "Auction",
      targetId: auction.id,
      after: { quoteRequestId: request.id, kind: "RECONFIRMATION", invited: organizationIds },
    });
    const quoteData = await quoteDataOf(tx, cipher, request);
    for (const organizationId of organizationIds) {
      const own = expired
        .filter((o) => o.organizationId === organizationId && o.annualGrossPremiumCents !== null)
        .map((o) => o.annualGrossPremiumCents as number);
      await notifier.notify(
        tx,
        pending,
        await agencyRecipients(tx, cipher, [organizationId]),
        "reconfirmation.requested",
        () => ({
          codice: request.code,
          veicolo: vehicleForAgency(quoteData),
          premio_offerto: own.length > 0 ? formatEuroCents(Math.min(...own)) : "",
          termine: formatDateTime(auction.scheduledCloseAt),
          link: `${urls.web}/richieste-in-arrivo`,
        }),
        `/richieste-in-arrivo`,
        { auctionId: auction.id },
      );
    }
    return { opened: true, invited: organizationIds.length, ...roundTimesOf(auction, calendar) };
  }

  async function openRound(input: {
    requestId: string;
    kind: RoundKind;
    round: number;
  }): Promise<OpenResult> {
    const result = await inSystem(async (tx, pending): Promise<OpenResult> => {
      const now = clock.now();
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${input.requestId}::uuid FOR UPDATE`;
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      const rounds = await tx.auction.findMany({
        where: { quoteRequestId: request.id },
        orderBy: { round: "asc" },
        include: { invitations: true },
      });
      // A repetition finds the round it already opened.
      const same = rounds.find((r) => r.round === input.round);
      if (same) {
        const calendar = await calendarOf(tx, same);
        return { opened: true, invited: same.invitations.length, ...roundTimesOf(same, calendar) };
      }
      const last = rounds.at(-1);
      if (input.kind === "RECONFIRMATION") {
        return openReconfirmation(tx, pending, request, rounds, now);
      }
      if (input.kind === "MAIN") {
        if (input.round !== 1 || rounds.length > 0 || request.status !== "IN_VERIFICATION") {
          return { opened: false, reason: "NOT_APPROVED" };
        }
        const round = await tx.verification.findFirst({
          where: { quoteRequestId: request.id },
          orderBy: { round: "desc" },
        });
        if (round?.decision !== "APPROVED") return { opened: false, reason: "NOT_APPROVED" };
        // LEG-04: no new auction once the customer has revoked the consent.
        const consent = await tx.consent.findFirst({
          where: {
            customerId: request.customerId ?? "",
            type: "DATA_SHARING_AGENCIES",
            revokedAt: null,
          },
        });
        if (!consent) return { opened: false, reason: "CONSENT_REVOKED" };
      } else if (
        request.status !== "AUCTION_OPEN" ||
        !last ||
        last.status !== "CLOSED" ||
        input.round !== last.round + 1
      ) {
        return { opened: false, reason: "NOT_REOPENABLE" };
      }

      const snapshot = await auctionSettingsAt(tx, now);
      const settings = auctionSettings(snapshot);
      const calendar = await loadWorkingCalendar(tx, snapshot["calendar.workingHours"]);
      const durationHours =
        input.kind === "MAIN"
          ? request.auctionDurationHours
          : snapshot["auction.desertedReopen.workingHours"];
      if (!durationHours || request.minValidityDays === null) {
        throw ApplicationFailure.nonRetryable("The request has no submitted data");
      }
      const times = auctionTimes(calendar, now, durationHours, request.minValidityDays, settings);
      const filterable = filterableRequest(request, now);
      if (!filterable) throw ApplicationFailure.nonRetryable("The request has no submitted data");
      const exclusions = await tx.invitationExclusion.findMany({
        where: { quoteRequestId: request.id },
      });
      const selection = selectAgencies({
        request: filterable,
        candidates: await loadAgencyCandidates(tx, now),
        calendar,
        openedAt: now,
        closeAt: times.scheduledCloseAt,
        minReceptionOverlapMinutes: settings.minReceptionOverlapWorkingHours * 60,
        // ASTA-08: the reopening invites every compatible agency not yet invited.
        limit: input.kind === "MAIN" ? settings.invitationsMax : null,
        alreadyInvited: rounds.flatMap((r) =>
          r.invitations.map((i) => ({ organizationId: i.organizationId, companies: [] })),
        ),
        excluded: exclusions.map((e) => e.organizationId),
        rotation: input.kind === "MAIN",
      });
      if (selection.selected.length === 0) return { opened: false, reason: "NO_AGENCIES" };

      const auctionId = randomUUID();
      const keys = await generateAuctionKeyPair();
      const wrappedPrivateKey = await kms.encrypt(KMS_KEYS.sealedBids, keys.privateKey, {
        purpose: "sealed-bid",
        auctionId,
      });
      await wipe(keys.privateKey);
      const auction = await tx.auction.create({
        data: {
          id: auctionId,
          quoteRequestId: request.id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          kind: input.kind,
          round: input.round,
          openedAt: now,
          scheduledCloseAt: times.scheduledCloseAt,
          originalCloseAt: times.scheduledCloseAt,
          minGuaranteeDate: calendarDateToDbDate(times.minGuaranteeDate),
          durationHours,
          // ASTA-09: parameters and holidays in force at the opening.
          settingsSnapshot: { ...snapshot, "calendar.holidays": [...calendar.holidays].sort() },
          publicKey: keys.publicKey,
          wrappedPrivateKey,
          kmsKeyRef: KMS_KEYS.sealedBids,
        },
      });
      const organizationIds = selection.selected.map((s) => s.organizationId);
      await invite(
        tx,
        pending,
        auction,
        request,
        organizationIds,
        input.kind === "MAIN" ? "AUTO" : "REOPEN",
        null,
      );
      // Process 10: a renewal invites the agency that issued the policy, filters aside,
      // unless it is suspended, not active or excluded from this request.
      if (input.kind === "MAIN" && request.renewalOfPolicyId) {
        const policy = await tx.policy.findUnique({ where: { id: request.renewalOfPolicyId } });
        const current = policy?.organizationId;
        if (current && !organizationIds.includes(current)) {
          const [org, suspended] = await Promise.all([
            tx.organization.findUnique({ where: { id: current } }),
            tx.agencySuspension.count({ where: { organizationId: current, revokedAt: null } }),
          ]);
          const excluded = exclusions.some((e) => e.organizationId === current);
          if (org?.status === "ACTIVE" && suspended === 0 && !excluded) {
            await invite(tx, pending, auction, request, [current], "RENEWAL", null);
          }
        }
      }
      await setRequestStatus(tx, request, "AUCTION_OPEN");
      await addRequestEvent(tx, request, {
        type: input.kind === "MAIN" ? "AUCTION_OPENED" : "AUCTION_REOPENED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
        details: {
          round: auction.round,
          scheduledCloseAt: auction.scheduledCloseAt.toISOString(),
        },
      });
      await recordDomainEvent(tx, {
        aggregateType: "Auction",
        aggregateId: auction.id,
        type: "AuctionOpened",
        at: now,
        actorUserId: null,
        data: { quoteRequestId: request.id, round: auction.round, invited: organizationIds.length },
      });
      await audit(tx, now, {
        action: "AUCTION_OPENED",
        targetType: "Auction",
        targetId: auction.id,
        after: { quoteRequestId: request.id, kind: input.kind, invited: organizationIds },
      });
      const quoteData = await quoteDataOf(tx, cipher, request);
      const requester = await requesterOf(tx, cipher, request);
      await notifier.notify(
        tx,
        pending,
        requester.recipients,
        input.kind === "MAIN" ? "auction.opened.requester" : "auction.reopened.requester",
        () => ({
          nome: requester.firstName,
          codice: request.code,
          veicolo: vehicleForRequester(quoteData),
          ora_chiusura: formatDateTime(auction.scheduledCloseAt),
          link: requesterLink(urls, request),
        }),
        new URL(requesterLink(urls, request)).pathname,
        { quoteRequestId: request.id },
      );
      return { opened: true, invited: organizationIds.length, ...roundTimesOf(auction, calendar) };
    });
    await publish(input.requestId);
    return result;
  }

  async function roundTimes(input: { auctionId: string }) {
    return withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const auction = await tx.auction.findUniqueOrThrow({ where: { id: input.auctionId } });
      return roundTimesOf(auction, await calendarOf(tx, auction));
    });
  }

  async function reopenPolicy(input: { auctionId: string }) {
    return withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const auction = await tx.auction.findUniqueOrThrow({ where: { id: input.auctionId } });
      const snapshot = snapshotOf(auction);
      return {
        enabled: snapshot["auction.desertedReopen.enabled"],
        maxAttempts: snapshot["auction.desertedReopen.maxAttempts"],
      };
    });
  }

  /** ASTA-04: at half of the auction, below 3 offers, up to 4 more agencies. */
  async function topUp(input: { auctionId: string }) {
    const result = await inSystem(async (tx, pending) => {
      const auction = await lockAuction(tx, input.auctionId);
      // GAR-07: a reconfirmation asks the same agencies only, no top-up.
      if (auction.status !== "OPEN" || auction.kind === "RECONFIRMATION") {
        return { invited: 0, requestId: auction.quoteRequestId };
      }
      const invitations = await tx.invitation.findMany({ where: { auctionId: auction.id } });
      if (invitations.some((i) => i.source === "TOP_UP")) {
        return { invited: 0, requestId: auction.quoteRequestId };
      }
      const offers = await tx.offer.count({
        where: { auctionId: auction.id, status: "SUBMITTED" },
      });
      const settings = auctionSettings(snapshotOf(auction));
      const size = topUpSize(offers, settings);
      if (size === 0) return { invited: 0, requestId: auction.quoteRequestId };
      const now = clock.now();
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: auction.quoteRequestId },
      });
      const filterable = filterableRequest(request, auction.openedAt);
      if (!filterable) return { invited: 0, requestId: request.id };
      const calendar = await calendarOf(tx, auction);
      const mandates = await tx.agencyMandate.findMany({
        where: { organizationId: { in: invitations.map((i) => i.organizationId) } },
      });
      const exclusions = await tx.invitationExclusion.findMany({
        where: { quoteRequestId: request.id },
      });
      const selection = selectAgencies({
        request: filterable,
        candidates: await loadAgencyCandidates(tx, now),
        calendar,
        openedAt: now,
        closeAt: auction.scheduledCloseAt,
        minReceptionOverlapMinutes: settings.minReceptionOverlapWorkingHours * 60,
        limit: size,
        alreadyInvited: invitations.map((i) => ({
          organizationId: i.organizationId,
          companies: mandates
            .filter((m) => m.organizationId === i.organizationId)
            .map((m) => m.companyId),
        })),
        excluded: exclusions.map((e) => e.organizationId),
        rotation: true,
      });
      const ids = selection.selected.map((s) => s.organizationId);
      if (ids.length > 0) {
        await invite(tx, pending, auction, request, ids, "TOP_UP", null);
        await addRequestEvent(tx, request, {
          type: "AUCTION_TOPPED_UP",
          actorKind: "SYSTEM",
          actorUserId: null,
          at: now,
        });
      }
      await audit(tx, now, {
        action: "AUCTION_TOPPED_UP",
        targetType: "Auction",
        targetId: auction.id,
        after: { offers, invited: ids },
      });
      return { invited: ids.length, requestId: request.id };
    });
    if (result.invited > 0) await publish(result.requestId);
    return { invited: result.invited };
  }

  /** ASTA-07: the invited agencies that have not offered yet. */
  async function remindAgencies(input: { auctionId: string }) {
    return inSystem(async (tx, pending) => {
      const auction = await tx.auction.findUniqueOrThrow({ where: { id: input.auctionId } });
      if (auction.status !== "OPEN") return { reminded: 0 };
      const sent = await tx.notification.count({
        where: {
          eventKey: "auction.closing_soon",
          payload: { path: ["auctionId"], equals: auction.id },
        },
      });
      if (sent > 0) return { reminded: 0 };
      const [invitations, offers] = await Promise.all([
        tx.invitation.findMany({ where: { auctionId: auction.id, status: { not: "DECLINED" } } }),
        tx.offer.findMany({ where: { auctionId: auction.id, status: "SUBMITTED" } }),
      ]);
      const offered = new Set(offers.map((o) => o.organizationId));
      const silent = invitations.map((i) => i.organizationId).filter((id) => !offered.has(id));
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: auction.quoteRequestId },
      });
      const quoteData = await quoteDataOf(tx, cipher, request);
      await notifier.notify(
        tx,
        pending,
        await agencyRecipients(tx, cipher, silent),
        "auction.closing_soon",
        () => ({
          codice: request.code,
          veicolo: vehicleForAgency(quoteData),
          ora_chiusura: formatDateTime(auction.scheduledCloseAt),
          link: `${urls.web}/richieste-in-arrivo`,
        }),
        `/richieste-in-arrivo`,
        { auctionId: auction.id },
      );
      return { reminded: silent.length };
    });
  }

  /**
   * The closing (docs/busta-chiusa.md, step 5): CLOSING under the row lock, so
   * that no submission gets in; the private key unwrapped by the KMS; every
   * envelope opened and checked (OFF-04..06); plain values, ranking (CLA-01)
   * and statuses written; the key wiped; CLOSED. Returns only counts (BC-07).
   */
  async function closeRound(input: { auctionId: string }): Promise<CloseResult> {
    const outcome = await inSystem(async (tx, pending) => {
      const auction = await lockAuction(tx, input.auctionId);
      if (auction.status === "CANCELLED") {
        return {
          validOffers: 0,
          excludedOffers: 0,
          cancelled: true,
          requestId: auction.quoteRequestId,
        };
      }
      if (auction.status === "CLOSED") {
        const valid = await tx.offer.count({
          where: {
            auctionId: auction.id,
            status: { notIn: ["SUBMITTED", "WITHDRAWN", "EXCLUDED"] },
          },
        });
        const excluded = await tx.offer.count({
          where: { auctionId: auction.id, status: "EXCLUDED" },
        });
        return {
          validOffers: valid,
          excludedOffers: excluded,
          cancelled: false,
          requestId: auction.quoteRequestId,
        };
      }
      const now = clock.now();
      // BC-03: never open the envelopes before the scheduled closing; a clock a
      // little behind the workflow's makes Temporal try again shortly.
      if (now < auction.scheduledCloseAt && !deps.allowEarlyClose) {
        throw ApplicationFailure.retryable("The auction is not due to close yet", "TOO_EARLY");
      }
      await tx.auction.update({ where: { id: auction.id }, data: { status: "CLOSING" } });
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: auction.quoteRequestId },
      });
      const offers = await tx.offer.findMany({
        where: { auctionId: auction.id, status: "SUBMITTED" },
      });

      const valid: {
        id: string;
        organizationId: string;
        payload: OfferPayload;
        lastChangedAt: Date;
      }[] = [];
      const excluded: { id: string; organizationId: string; reason: string }[] = [];
      if (offers.length > 0) {
        const privateKey = await kms.decrypt(KMS_KEYS.sealedBids, auction.wrappedPrivateKey, {
          purpose: "sealed-bid",
          auctionId: auction.id,
        });
        try {
          const requirements = await requestRequirements(tx, request, auction.openedAt);
          if (!requirements) throw new Error("The request has no readable package");
          const legal = await settingsAt(tx, ["rca.legalMinimums"], auction.openedAt);
          const minimum = dbDateToCalendarDate(auction.minGuaranteeDate);
          for (const offer of offers) {
            const opened = await openSealed(auction.publicKey, privateKey, offer.sealedPayload);
            const parsed = OfferPayloadSchema.safeParse(
              JSON.parse(new TextDecoder().decode(opened)),
            );
            if (!parsed.success) {
              excluded.push({
                id: offer.id,
                organizationId: offer.organizationId,
                reason: "INVALID_CONTENT",
              });
              continue;
            }
            const p = parsed.data;
            const [mandate, product] = await Promise.all([
              tx.agencyMandate.findFirst({
                where: {
                  organizationId: offer.organizationId,
                  companyId: p.companyId,
                  verifiedAt: { not: null },
                },
              }),
              tx.insuranceProduct.findFirst({
                where: {
                  id: p.productId,
                  organizationId: offer.organizationId,
                  companyId: p.companyId,
                },
              }),
            ]);
            const short = coverageShortfalls(requirements, p.coverage, {
              rcaBodilyInjuryPerClaimEur: legal["rca.legalMinimums"].bodilyInjuryPerClaimEur,
              rcaPropertyDamagePerClaimEur: legal["rca.legalMinimums"].propertyDamagePerClaimEur,
            });
            const reason = !mandate
              ? "COMPANY_NOT_MANDATED"
              : !product
                ? "PRODUCT_NOT_FOUND"
                : !guaranteeDateAccepted(p.guaranteeUntil, minimum)
                  ? "GUARANTEE_BEFORE_MINIMUM"
                  : short.length > 0
                    ? `COVERAGE:${short.join(",")}`
                    : null;
            if (reason)
              excluded.push({ id: offer.id, organizationId: offer.organizationId, reason });
            else
              valid.push({
                id: offer.id,
                organizationId: offer.organizationId,
                payload: p,
                lastChangedAt: offer.lastChangedAt,
              });

            // The PDF becomes an ordinary document of the request (SSE in the cloud).
            if (offer.sealedPdfKey && offer.sealedPdfDataKey) {
              const key = await openSealed(auction.publicKey, privateKey, offer.sealedPdfDataKey);
              const pdf = await decryptFile(key, await deps.storage.get(offer.sealedPdfKey));
              await wipe(key);
              const storageKey = `documents/${randomUUID()}`;
              await deps.storage.put({
                key: storageKey,
                body: pdf,
                contentType: "application/pdf",
              });
              const document = await tx.document.create({
                data: {
                  kind: "OFFER_QUOTE",
                  ownerUserId: request.ownerUserId,
                  ownerOrganizationId: request.ownerOrganizationId,
                  quoteRequestId: request.id,
                  storageKey,
                  sha256: createHash("sha256").update(pdf).digest("hex"),
                  mime: "application/pdf",
                  size: pdf.length,
                  fileName: notifier.label("offerQuote.fileName", "it"),
                  uploadedByUserId: offer.userId,
                },
              });
              await tx.offer.update({
                where: { id: offer.id },
                data: { pdfDocumentId: document.id },
              });
            } else if (auction.kind === "RECONFIRMATION") {
              // GAR-07, proposal C: a confirmation may keep the quote of the previous
              // round: the agency's latest PDF stays the document of this offer.
              const previous = await tx.offer.findFirst({
                where: {
                  organizationId: offer.organizationId,
                  pdfDocumentId: { not: null },
                  auction: { quoteRequestId: request.id, round: { lt: auction.round } },
                },
                orderBy: { auction: { round: "desc" } },
              });
              if (previous?.pdfDocumentId) {
                await tx.offer.update({
                  where: { id: offer.id },
                  data: { pdfDocumentId: previous.pdfDocumentId },
                });
              }
            }
          }
        } finally {
          await wipe(privateKey);
        }
      }

      const ranked = rankOffers(
        valid.map((v) => ({
          id: v.id,
          companyId: v.payload.companyId,
          annualGrossPremiumCents: v.payload.annualGrossPremiumCents,
          guaranteeUntil: v.payload.guaranteeUntil,
          lastSubmittedAt: v.lastChangedAt,
        })),
      );
      for (const r of ranked) {
        const p = valid.find((v) => v.id === r.id)?.payload;
        if (!p) continue;
        transitionOffer("SUBMITTED", "AWAITING_CUSTOMER");
        await tx.offer.update({
          where: { id: r.id },
          data: {
            status: "AWAITING_CUSTOMER",
            annualGrossPremiumCents: p.annualGrossPremiumCents,
            companyId: p.companyId,
            productId: p.productId,
            coverage: p.coverage,
            guaranteeUntil: calendarDateToDbDate(p.guaranteeUntil),
            notes: p.notes,
            rank: r.rank,
          },
        });
      }
      for (const e of excluded) {
        transitionOffer("SUBMITTED", "EXCLUDED");
        await tx.offer.update({
          where: { id: e.id },
          data: { status: "EXCLUDED", exclusionReason: e.reason },
        });
      }
      await tx.ranking.create({
        data: {
          quoteRequestId: request.id,
          auctionId: auction.id,
          entries: ranked.map((r) => ({
            offerId: r.id,
            organizationId: valid.find((v) => v.id === r.id)?.organizationId ?? null,
            rank: r.rank,
            annualGrossPremiumCents: r.annualGrossPremiumCents,
          })),
          validCount: ranked.length,
        },
      });
      await tx.auction.update({
        where: { id: auction.id },
        data: { status: "CLOSED", closedAt: now },
      });
      // Phase 8 (docs/sorveglianza.md): the closing must come within 5 seconds of its time.
      const delayMs = now.getTime() - auction.scheduledCloseAt.getTime();
      if (delayMs > CLOSE_DELAY_ALARM_MS) {
        deps.logger.warn(
          { alarm: "AUCTION_CLOSE_LATE", auctionId: auction.id, delayMs },
          "auction closed late",
        );
      }
      if (ranked.length > 0) await setRequestStatus(tx, request, "OFFERS_AVAILABLE");
      await addRequestEvent(tx, request, {
        type: "AUCTION_CLOSED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
        details: { round: auction.round, validOffers: ranked.length },
      });
      await audit(tx, now, {
        action: "AUCTION_CLOSED",
        targetType: "Auction",
        targetId: auction.id,
        after: { offers: offers.length, valid: ranked.length, excluded: excluded.length },
      });

      const quoteData = await quoteDataOf(tx, cipher, request);
      if (ranked.length > 0) {
        const requester = await requesterOf(tx, cipher, request);
        await notifier.notify(
          tx,
          pending,
          requester.recipients,
          auction.kind === "RECONFIRMATION"
            ? "reconfirmation.completed.requester"
            : "auction.closed.requester",
          () => ({
            nome: requester.firstName,
            codice: request.code,
            veicolo: vehicleForRequester(quoteData),
            numero_offerte: String(ranked.length),
            premio_minimo: formatEuroCents(
              Math.min(...ranked.map((o) => o.annualGrossPremiumCents)),
            ),
            link: requesterLink(urls, request),
          }),
          new URL(requesterLink(urls, request)).pathname,
          { quoteRequestId: request.id },
        );
      }
      // Each agency learns only the status of its own offer (CLA-04), never a price.
      for (const offer of [...valid, ...excluded]) {
        const isValid = valid.some((v) => v.id === offer.id);
        const guarantee = valid.find((v) => v.id === offer.id)?.payload.guaranteeUntil;
        await notifier.notify(
          tx,
          pending,
          await agencyRecipients(tx, cipher, [offer.organizationId]),
          "auction.closed.agency",
          (locale) => ({
            codice: request.code,
            veicolo: vehicleForAgency(quoteData),
            stato_offerta: notifier.label(
              isValid ? "offerStatus.valid" : "offerStatus.excluded",
              locale,
            ),
            motivo_esclusione: notifier.label(
              isValid ? "offerExclusion.none" : "offerExclusion.generic",
              locale,
            ),
            garanzia_offerta: guarantee
              ? formatDate(guarantee)
              : notifier.label("guarantee.none", locale),
            link: `${urls.web}/le-mie-offerte`,
          }),
          `/le-mie-offerte`,
          { auctionId: auction.id },
        );
      }
      return {
        validOffers: ranked.length,
        excludedOffers: excluded.length,
        cancelled: false,
        requestId: request.id,
      };
    });
    await publish(outcome.requestId);
    return {
      validOffers: outcome.validOffers,
      excludedOffers: outcome.excludedOffers,
      cancelled: outcome.cancelled,
    };
  }

  /** ASTA-08: no valid offer, also after the reopening (or no agency to reopen with). */
  async function markDeserted(input: { requestId: string }) {
    await inSystem(async (tx, pending) => {
      const now = clock.now();
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      if (request.status === "DESERTED") return;
      await setRequestStatus(tx, request, "DESERTED");
      await addRequestEvent(tx, request, {
        type: "DESERTED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
      });
      await audit(tx, now, {
        action: "REQUEST_DESERTED",
        targetType: "QuoteRequest",
        targetId: request.id,
      });
      const quoteData = await quoteDataOf(tx, cipher, request);
      const requester = await requesterOf(tx, cipher, request);
      await notifier.notify(
        tx,
        pending,
        requester.recipients,
        "auction.deserted.requester",
        () => ({
          nome: requester.firstName,
          codice: request.code,
          veicolo: vehicleForRequester(quoteData),
        }),
        new URL(requesterLink(urls, request)).pathname,
        { quoteRequestId: request.id },
      );
      await notifier.notify(
        tx,
        pending,
        await staffRecipients(tx, cipher, ["BO_VERIFIER", "BO_SUPERVISOR"]),
        "auction.deserted.bo",
        () => ({
          codice: request.code,
          veicolo: vehicleForAgency(quoteData),
          link: `${urls.admin}/aste`,
        }),
        `/aste`,
        { quoteRequestId: request.id },
      );
    });
    await publish(input.requestId);
  }

  /**
   * ASTA-06: a later closing; the minimum guarantee does not move (GAR-01).
   * Idempotent: the extension carries the action's id, applied once only. An
   * auction past its scheduled closing is not extended (BC-05).
   */
  async function extendRound(input: BackOfficeAction & { workingHours: number }) {
    const requestId = await inSystem(async (tx) => {
      const auction = await lockAuction(tx, input.auctionId);
      const applied = (auction.extensions as { actionId?: string }[]).some(
        (e) => e.actionId === input.actionId,
      );
      if (applied) return auction.quoteRequestId;
      const now = clock.now();
      if (auction.status !== "OPEN" || now >= auction.scheduledCloseAt) {
        throw ApplicationFailure.nonRetryable("AUCTION_NOT_OPEN");
      }
      const calendar = await calendarOf(tx, auction);
      const to = addWorkingMinutes(calendar, auction.scheduledCloseAt, input.workingHours * 60);
      const extensions = [
        ...(auction.extensions as Prisma.InputJsonArray),
        {
          actionId: input.actionId,
          at: now.toISOString(),
          byUserId: input.byUserId,
          workingHours: input.workingHours,
          from: auction.scheduledCloseAt.toISOString(),
          to: to.toISOString(),
        },
      ];
      await tx.auction.update({
        where: { id: auction.id },
        data: { scheduledCloseAt: to, extensions },
      });
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: auction.quoteRequestId },
      });
      await addRequestEvent(tx, request, {
        type: "AUCTION_EXTENDED",
        actorKind: "BACK_OFFICE",
        actorUserId: input.byUserId,
        at: now,
        details: { scheduledCloseAt: to.toISOString() },
      });
      await audit(tx, now, {
        action: "AUCTION_EXTENDED",
        targetType: "Auction",
        targetId: auction.id,
        actorUserId: input.byUserId,
        after: {
          actionId: input.actionId,
          from: auction.scheduledCloseAt.toISOString(),
          to: to.toISOString(),
        },
      });
      return request.id;
    });
    await publish(requestId);
  }

  /** ASTA-06: invitations by the back office, only in the first half of the auction. */
  async function addInvitations(input: BackOfficeAction & { organizationIds: string[] }) {
    const result = await inSystem(async (tx, pending) => {
      const auction = await lockAuction(tx, input.auctionId);
      const now = clock.now();
      const calendar = await calendarOf(tx, auction);
      if (
        auction.status !== "OPEN" ||
        !backOfficeMayInvite(
          calendar,
          auction.openedAt,
          auction.originalCloseAt,
          now,
          auctionSettings(snapshotOf(auction)),
        )
      ) {
        throw ApplicationFailure.nonRetryable("AFTER_FIRST_HALF");
      }
      const already = new Set(
        (await tx.invitation.findMany({ where: { auctionId: auction.id } })).map(
          (i) => i.organizationId,
        ),
      );
      const agencies = await tx.organization.findMany({
        where: { id: { in: input.organizationIds }, type: "AGENCY", status: "ACTIVE" },
      });
      const ids = agencies.map((a) => a.id).filter((id) => !already.has(id));
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: auction.quoteRequestId },
      });
      if (ids.length > 0)
        await invite(tx, pending, auction, request, ids, "BACK_OFFICE", input.byUserId);
      await addRequestEvent(tx, request, {
        type: "AUCTION_INVITATIONS_ADDED",
        actorKind: "BACK_OFFICE",
        actorUserId: input.byUserId,
        at: now,
      });
      await audit(tx, now, {
        action: "AUCTION_INVITATIONS_ADDED",
        targetType: "Auction",
        targetId: auction.id,
        actorUserId: input.byUserId,
        after: { actionId: input.actionId, invited: ids },
      });
      return { invited: ids.length, requestId: request.id };
    });
    await publish(result.requestId);
    return { invited: result.invited };
  }

  /**
   * ASTA-06: the back office cancels the auction, with reason. The request
   * becomes «Annullata» (question 13, answer B). Sealed offers stay sealed.
   */
  async function cancelRound(input: BackOfficeAction) {
    const requestId = await inSystem(async (tx, pending) => {
      const auction = await lockAuction(tx, input.auctionId);
      if (auction.status !== "OPEN") return auction.quoteRequestId;
      const now = clock.now();
      await tx.auction.update({
        where: { id: auction.id },
        // The reason is in the audit log of the API, under the action's id.
        data: { status: "CANCELLED", closedAt: now, cancelReason: `action:${input.actionId}` },
      });
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: auction.quoteRequestId },
      });
      await setRequestStatus(tx, request, "CANCELLED");
      await addRequestEvent(tx, request, {
        type: "AUCTION_CANCELLED",
        actorKind: "BACK_OFFICE",
        actorUserId: input.byUserId,
        at: now,
      });
      await audit(tx, now, {
        action: "AUCTION_CANCELLED",
        targetType: "Auction",
        targetId: auction.id,
        actorUserId: input.byUserId,
        after: { actionId: input.actionId },
      });
      const quoteData = await quoteDataOf(tx, cipher, request);
      const requester = await requesterOf(tx, cipher, request);
      await notifier.notify(
        tx,
        pending,
        requester.recipients,
        "auction.cancelled.requester",
        () => ({
          nome: requester.firstName,
          codice: request.code,
          veicolo: vehicleForRequester(quoteData),
        }),
        new URL(requesterLink(urls, request)).pathname,
        { quoteRequestId: request.id },
      );
      return request.id;
    });
    await publish(requestId);
  }

  /** Rule 4: the outcome of a back office request the workflow did not apply. */
  async function recordBackOfficeOutcome(
    input: BackOfficeAction & {
      kind: "extend" | "invite" | "cancel";
      result: "OTHER_ROUND" | "REFUSED";
    },
  ) {
    await inSystem(async (tx) => {
      const already = await tx.auditLog.count({
        where: {
          action: "AUCTION_REQUEST_NOT_APPLIED",
          targetId: input.auctionId,
          after: { path: ["actionId"], equals: input.actionId },
        },
      });
      if (already > 0) return;
      await audit(tx, clock.now(), {
        action: "AUCTION_REQUEST_NOT_APPLIED",
        targetType: "Auction",
        targetId: input.auctionId,
        actorUserId: input.byUserId,
        after: { actionId: input.actionId, kind: input.kind, result: input.result },
      });
    });
  }

  return {
    recordBackOfficeOutcome,
    openRound,
    roundTimes,
    reopenPolicy,
    topUp,
    remindAgencies,
    closeRound,
    markDeserted,
    extendRound,
    addInvitations,
    cancelRound,
  };
}

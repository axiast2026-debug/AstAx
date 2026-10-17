import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { KmsPort } from "@astax/adapters/kms";
import type { DocumentReaderPort } from "@astax/adapters/document-reader";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  appendAudit,
  auctionSettings,
  loadWorkingCalendar,
  type Auction,
  type AuctionSettingsSnapshot,
  type DbClient,
  type DbTransaction,
  type QuoteRequest,
} from "@astax/db";
import {
  auctionTimes,
  subtractWorkingMinutes,
  type QuoteData,
  type WorkingCalendar,
} from "@astax/shared/domain";
import type { Logger } from "@astax/shared/logging";
import type { WorkerNotifier, Recipient } from "../notifier.js";
import type { RoundTimes } from "./types.js";

/** A change the API forwards to the browsers that follow it (ADR 0008). */
export interface RealtimeEvent {
  type: "AUCTION_CHANGED" | "REQUEST_CHANGED";
  requestId: string;
}

export interface ActivityDeps {
  db: DbClient;
  /** Holds only astax-sealed-bids (ADR 0005). */
  kms: KmsPort;
  clock: Clock;
  cipher: FieldCipher;
  storage: ObjectStoragePort;
  /** OFF-09: reads the PDF quotes after the closing (fake in development and tests). */
  reader: DocumentReaderPort;
  notifier: WorkerNotifier;
  logger: Logger;
  urls: { web: string; admin: string };
  publish: (event: RealtimeEvent) => Promise<void>;
  /**
   * Development tool «Fai scattare il prossimo passo» (DEV_TOOLS only): the
   * closing may come before its scheduled time. Otherwise opening the
   * envelopes early is refused (BC-03).
   */
  allowEarlyClose: boolean;
}

export const SYSTEM_ACTOR = {
  actorUserId: null,
  actorMembershipId: null,
  actorOrganizationId: null,
  ip: null,
  userAgent: null,
} as const;

/** Appends to the audit log as the system, or as the back office user who asked. */
export function audit(
  tx: DbTransaction,
  at: Date,
  entry: {
    action: string;
    targetType: string;
    targetId: string;
    after?: unknown;
    reason?: string | null;
    actorUserId?: string | null;
  },
) {
  return appendAudit(tx, {
    ...SYSTEM_ACTOR,
    actorUserId: entry.actorUserId ?? null,
    at,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    before: null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}

export function quoteDataOf(
  tx: DbTransaction,
  cipher: FieldCipher,
  request: QuoteRequest,
): Promise<QuoteData> {
  if (request.quoteDataVersion === null) throw new Error("The request has no submitted data");
  return tx.quoteDataVersion
    .findUniqueOrThrow({
      where: {
        quoteRequestId_version: { quoteRequestId: request.id, version: request.quoteDataVersion },
      },
    })
    .then((v) => JSON.parse(cipher.decrypt(v.dataEnc)) as QuoteData);
}

async function recipientsOf(
  tx: DbTransaction,
  cipher: FieldCipher,
  userIds: readonly string[],
): Promise<Recipient[]> {
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set(userIds)] }, status: "ACTIVE" },
  });
  return users.map((u) => ({
    userId: u.id,
    locale: u.locale === "sq" ? "sq" : "it",
    email: u.emailEnc ? cipher.decrypt(u.emailEnc) : null,
  }));
}

export async function requesterOf(tx: DbTransaction, cipher: FieldCipher, request: QuoteRequest) {
  const [recipient] = await recipientsOf(tx, cipher, [request.requesterUserId]);
  const user = await tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } });
  return { recipients: recipient ? [recipient] : [], firstName: user.firstName };
}

/** The active members of the agencies; never anything about the customer (VIS-01). */
export async function agencyRecipients(
  tx: DbTransaction,
  cipher: FieldCipher,
  organizationIds: readonly string[],
): Promise<Recipient[]> {
  if (organizationIds.length === 0) return [];
  const memberships = await tx.membership.findMany({
    where: { organizationId: { in: [...organizationIds] }, status: "ACTIVE" },
  });
  return recipientsOf(
    tx,
    cipher,
    memberships.map((m) => m.userId),
  );
}

export async function staffRecipients(
  tx: DbTransaction,
  cipher: FieldCipher,
  roles: readonly ("BO_VERIFIER" | "BO_SUPERVISOR")[],
): Promise<Recipient[]> {
  const memberships = await tx.membership.findMany({
    where: { role: { in: [...roles] }, status: "ACTIVE", organization: { type: "ASTAX" } },
  });
  return recipientsOf(
    tx,
    cipher,
    memberships.map((m) => m.userId),
  );
}

export function snapshotOf(auction: Auction): AuctionSettingsSnapshot {
  return auction.settingsSnapshot as unknown as AuctionSettingsSnapshot;
}

export async function calendarOf(tx: DbTransaction, auction: Auction): Promise<WorkingCalendar> {
  const snapshot = snapshotOf(auction);
  return loadWorkingCalendar(tx, snapshot["calendar.workingHours"], snapshot);
}

/**
 * The timers of a round. Top-up and back office window are fractions of the
 * planned duration from the opening; the reminder follows the closing, also
 * after an extension (ASTA-07).
 */
export function roundTimesOf(auction: Auction, calendar: WorkingCalendar): RoundTimes {
  const settings = auctionSettings(snapshotOf(auction));
  const planned = auctionTimes(calendar, auction.openedAt, auction.durationHours, 0, settings);
  const total = auction.durationHours * 60;
  const reminderAt =
    total <= 2 * settings.closingReminderMinutes
      ? planned.reminderAt
      : subtractWorkingMinutes(calendar, auction.scheduledCloseAt, settings.closingReminderMinutes);
  return {
    auctionId: auction.id,
    status: auction.status,
    scheduledCloseAt: auction.scheduledCloseAt.toISOString(),
    topUpAt: planned.topUpAt.toISOString(),
    reminderAt: reminderAt.toISOString(),
  };
}

export function requesterLink(urls: ActivityDeps["urls"], request: QuoteRequest): string {
  return request.channel === "PRIVATE"
    ? `${urls.web}/preventivi/${request.id}`
    : `${urls.web}/richieste/${request.id}`;
}

/** Rule 8: make and model only in notifications, never the plate. */
export function vehicleForRequester(quoteData: QuoteData): string {
  return `${quoteData.vehicle.make} ${quoteData.vehicle.model}`;
}

/** For the agencies: make and model only. */
export function vehicleForAgency(quoteData: QuoteData): string {
  return `${quoteData.vehicle.make} ${quoteData.vehicle.model}`;
}

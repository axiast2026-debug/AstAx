import { ManualClock } from "@astax/adapters/clock";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { InMemoryEmailSender } from "@astax/adapters/email";
import { encryptFile, KMS_KEYS, LocalKms, seal } from "@astax/adapters/kms";
import { InMemoryObjectStorage } from "@astax/adapters/storage";
import {
  createDbClient,
  kmsEventRecorder,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
} from "@astax/db";
import { syntheticId } from "@astax/db/seed";
import {
  derivedColumns,
  sampleQuoteData,
  type OfferCoverage,
  type OfferPayload,
  type QuoteData,
} from "@astax/shared/domain";
import { calendarDateToDbDate } from "@astax/shared/format";
import { createLogger } from "@astax/shared/logging";
import { inject } from "vitest";
import { createActivities, type RealtimeEvent } from "../../src/activities/index.js";
import { WorkerNotifier } from "../../src/notifier.js";

export const TEST_SEED = "worker-int";
export const TEST_CIPHER_KEYS = { encryption: "3".repeat(64), blindIndex: "4".repeat(64) };
export const SEALED_KEY = "5".repeat(64);

export const userId = (key: string) => syntheticId(TEST_SEED, "user", key);
export const orgId = (key: string) => syntheticId(TEST_SEED, "org", key);

export interface Harness {
  db: DbClient;
  clock: ManualClock;
  cipher: LocalFieldCipher;
  email: InMemoryEmailSender;
  storage: InMemoryObjectStorage;
  events: RealtimeEvent[];
  activities: ReturnType<typeof createActivities>;
}

export function harness(start: string): Harness {
  const db = createDbClient(inject("workerDbUrl"));
  const clock = new ManualClock(start);
  const cipher = new LocalFieldCipher(TEST_CIPHER_KEYS.encryption, TEST_CIPHER_KEYS.blindIndex);
  const email = new InMemoryEmailSender();
  const storage = new InMemoryObjectStorage();
  const events: RealtimeEvent[] = [];
  const logger = createLogger({ name: "worker-test", level: "silent" });
  const activities = createActivities({
    db,
    kms: new LocalKms(
      { [KMS_KEYS.sealedBids]: SEALED_KEY },
      kmsEventRecorder(db, "worker", () => clock.now()),
    ),
    clock,
    cipher,
    storage,
    notifier: new WorkerNotifier(email, logger),
    logger,
    urls: { web: "http://web.test", admin: "http://admin.test" },
    publish: async (event) => {
      events.push(event);
    },
    allowEarlyClose: false,
  });
  return { db, clock, cipher, email, storage, events, activities };
}

let counter = 0;

/**
 * A private request of Giulia Neri, submitted, with the consent and approved by
 * the back office: what the worker finds when the outbox delivers RequestApproved.
 */
export async function approvedRequest(
  h: Harness,
  change: (q: QuoteData) => QuoteData = (q) => q,
): Promise<{ id: string; code: string }> {
  counter += 1;
  const giulia = userId("private-giulia-neri");
  const quote = change(sampleQuoteData());
  const derived = derivedColumns(quote);
  const now = h.clock.now();
  return withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
    const person = await tx.person.create({
      data: { ownerUserId: giulia, kind: "PERSON", surname: "Neri", givenName: "Giulia" },
    });
    const customer = await tx.customer.create({
      data: {
        ownerUserId: giulia,
        personId: person.id,
        emailEnc: h.cipher.encrypt("giulia.cliente@example.test"),
        phoneEnc: h.cipher.encrypt("+39 333 999 0001"),
      },
    });
    const code = `AX-T-${String(counter).padStart(4, "0")}-${Math.random().toString(36).slice(2, 6)}`;
    const request = await tx.quoteRequest.create({
      data: {
        code,
        channel: "PRIVATE",
        ownerUserId: giulia,
        requesterUserId: giulia,
        customerId: customer.id,
        status: "IN_VERIFICATION",
        quoteDataVersion: 1,
        plate: quote.vehicle.plate,
        vehicleType: derived.vehicleType,
        province: derived.province,
        cuClass: derived.cuClass,
        claimsLast5y: derived.claimsLast5y,
        youngestDriverAge: derived.youngestDriverAge,
        packageCode: derived.packageCode,
        startDate: calendarDateToDbDate(derived.startDate),
        minValidityDays: derived.minValidityDays,
        auctionDurationHours: quote.request.auctionDurationHours,
        autoOutcome: "GREEN",
        submittedAt: now,
      },
    });
    await tx.quoteDataVersion.create({
      data: {
        quoteRequestId: request.id,
        ownerUserId: giulia,
        version: 1,
        dataEnc: h.cipher.encrypt(JSON.stringify(quote)),
        dataSha256: "test",
        source: "SUBMISSION",
        createdByUserId: giulia,
      },
    });
    await tx.consent.create({
      data: {
        customerId: customer.id,
        ownerUserId: giulia,
        quoteRequestId: request.id,
        type: "DATA_SHARING_AGENCIES",
        method: "OTP_PRIVATE",
        evidence: {},
        acceptedAt: now,
      },
    });
    await tx.verification.create({
      data: {
        quoteRequestId: request.id,
        ownerUserId: giulia,
        round: 1,
        quoteDataVersion: 1,
        autoOutcome: "GREEN",
        checklist: [],
        decision: "APPROVED",
        decidedAt: now,
      },
    });
    return { id: request.id, code };
  });
}

export const FULL_BASE_COVERAGE: OfferCoverage = {
  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
  recourseWaiver: { included: false },
  roadsideAssistance: { included: false },
  legalProtection: { included: false },
  driverAccident: { included: false },
  theftFire: { included: false },
  naturalEventsVandalism: { included: false },
  glass: { included: false },
};

/**
 * An offer as the API stores it (step 7): sealed with the auction's public
 * key, the PDF encrypted, an owner copy (here a placeholder: the API's key).
 */
type TestPayload = Omit<OfferPayload, "companyId" | "productId"> & { company?: string };

export function sealedOffer(
  h: Harness,
  auctionId: string,
  agency: string,
  payload: TestPayload,
  submittedAt: Date,
) {
  return withContext(h.db, SYSTEM_CONTEXT, (tx) =>
    insertSealedOffer(h, tx, auctionId, agency, payload, submittedAt),
  );
}

/** The same, inside a transaction of the caller (the API submits under the auction's lock). */
export async function insertSealedOffer(
  h: Harness,
  tx: DbTransaction,
  auctionId: string,
  agency: string,
  payload: TestPayload,
  submittedAt: Date,
) {
  {
    const auction = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } });
    const organizationId = orgId(agency);
    const product = await tx.insuranceProduct.findFirstOrThrow({
      where: {
        organizationId,
        ...(payload.company ? { company: { name: payload.company } } : {}),
      },
    });
    const owner = await tx.membership.findFirstOrThrow({
      where: { organizationId, role: "OWNER" },
    });
    const content: OfferPayload = {
      annualGrossPremiumCents: payload.annualGrossPremiumCents,
      coverage: payload.coverage,
      guaranteeUntil: payload.guaranteeUntil,
      notes: payload.notes,
      companyId: product.companyId,
      productId: product.id,
    };
    const pdf = await encryptFile(new TextEncoder().encode(`%PDF-1.7 preventivo ${agency}`));
    const pdfKey = `sealed/${crypto.randomUUID()}`;
    await h.storage.put({
      key: pdfKey,
      body: pdf.encrypted,
      contentType: "application/octet-stream",
    });
    return tx.offer.create({
      data: {
        auctionId,
        organizationId,
        membershipId: owner.id,
        userId: owner.userId,
        submittedAt,
        lastChangedAt: submittedAt,
        sealedPayload: await seal(
          auction.publicKey,
          new TextEncoder().encode(JSON.stringify(content)),
        ),
        sealedPdfKey: pdfKey,
        sealedPdfDataKey: await seal(auction.publicKey, pdf.key),
        ownerCopy: "v1:kms:astax-offer-owner:placeholder",
      },
    });
  }
}

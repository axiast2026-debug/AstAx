import { addCalendarDays, type QuoteData, type QuoteDraft } from "@astax/shared/domain";
import { dbDateToCalendarDate, romeCalendarDate } from "@astax/shared/format";
import { settingsAt } from "./auction-data.js";
import type { DbTransaction } from "./client.js";
import { addRequestEvent, type ActorKind } from "./request-events.js";

/** The request code `AX-AAAA-NNNNNN` (decision 34), from the database sequence. */
export async function nextRequestCode(tx: DbTransaction, now: Date): Promise<string> {
  const { "requests.codePrefix": prefix } = await settingsAt(tx, ["requests.codePrefix"], now);
  const [row] = await tx.$queryRaw<
    { n: bigint }[]
  >`SELECT nextval('quote_request_number_seq') AS n`;
  const year = romeCalendarDate(now).slice(0, 4);
  return `${prefix}-${year}-${String(row?.n ?? 0).padStart(6, "0")}`;
}

/**
 * The documents a renewal keeps from the policy's request: the risk certificate is
 * new. Dan, 2026-10-28: the ID card instead of the licence (older requests keep theirs).
 */
const KEPT_DOCUMENTS = [
  "REGISTRATION_CERTIFICATE",
  "IDENTITY_DOCUMENT",
  "DRIVING_LICENCE",
] as const;

/**
 * Process 10, spec 03 «Rinnova in asta», proposal E of phase 6: the renewal
 * of a policy as a draft already filled with the saved data, the new start
 * the day after the end, the current insurer and premium filled in, the
 * registration certificate and the licences kept (their objects copied);
 * the requester only adds the new risk certificate and submits, and the back
 * office verifies it as any request. Once per policy: a second call returns
 * the draft already made. A system step: the caller runs it in the system
 * context, with the cipher of the field encryption (ADR 0007).
 */
export async function createRenewalDraft(
  tx: DbTransaction,
  crypto: { encrypt: (plain: string) => string; decrypt: (sealed: string) => string },
  copyObject: (key: string, mime: string) => Promise<string>,
  input: { policyId: string; actorKind: ActorKind; actorUserId: string | null },
  now: Date,
): Promise<{ requestId: string; code: string; created: boolean }> {
  await tx.$queryRaw`SELECT 1 FROM "Policy" WHERE "id" = ${input.policyId}::uuid FOR UPDATE`;
  const policy = await tx.policy.findUniqueOrThrow({ where: { id: input.policyId } });
  if (policy.renewalRequestId) {
    const existing = await tx.quoteRequest.findUniqueOrThrow({
      where: { id: policy.renewalRequestId },
    });
    return { requestId: existing.id, code: existing.code, created: false };
  }
  const previous = await tx.quoteRequest.findUniqueOrThrow({
    where: { id: policy.quoteRequestId },
  });
  const version = await tx.quoteDataVersion.findUniqueOrThrow({
    where: {
      quoteRequestId_version: {
        quoteRequestId: previous.id,
        version: previous.quoteDataVersion ?? 1,
      },
    },
  });
  const data = JSON.parse(crypto.decrypt(version.dataEnc)) as QuoteData;
  const company = await tx.insuranceCompany.findUnique({ where: { id: policy.companyId } });
  const endDate = dbDateToCalendarDate(policy.endDate);
  const draft: QuoteDraft = {
    policyHolder: data.policyHolder,
    vehicleOwner: data.vehicleOwner,
    vehicle: data.vehicle,
    history: {
      ...data.history,
      ...(company ? { currentInsurer: company.name } : {}),
      currentExpiryDate: endDate,
    },
    driving: { drivers: data.drivers, drivingFormula: data.drivingFormula },
    request: {
      ...data.request,
      startDate: addCalendarDays(endDate, 1),
      currentPremiumCents: policy.premiumCents,
    },
  };
  const request = await tx.quoteRequest.create({
    data: {
      code: await nextRequestCode(tx, now),
      channel: previous.channel,
      ownerUserId: previous.ownerUserId,
      ownerOrganizationId: previous.ownerOrganizationId,
      requesterUserId: previous.requesterUserId,
      requesterMembershipId: previous.requesterMembershipId,
      customerId: previous.customerId,
      draftEnc: crypto.encrypt(JSON.stringify(draft)),
      renewalOfPolicyId: policy.id,
      createdAt: now,
      updatedAt: now,
    },
  });
  const documents = await tx.document.findMany({
    where: { quoteRequestId: previous.id, kind: { in: [...KEPT_DOCUMENTS] }, deletedAt: null },
  });
  for (const d of documents) {
    await tx.document.create({
      data: {
        kind: d.kind,
        ownerUserId: d.ownerUserId,
        ownerOrganizationId: d.ownerOrganizationId,
        quoteRequestId: request.id,
        customerId: d.customerId,
        driverIndex: d.driverIndex,
        storageKey: await copyObject(d.storageKey, d.mime),
        sha256: d.sha256,
        mime: d.mime,
        size: d.size,
        fileName: d.fileName,
        encryption: d.encryption,
        uploadedByUserId: d.uploadedByUserId,
        extractionEnc: d.extractionEnc,
        extractedAt: d.extractedAt,
        createdAt: now,
        updatedAt: now,
      },
    });
  }
  await tx.policy.update({
    where: { id: policy.id },
    data: { renewalRequestId: request.id, updatedAt: now },
  });
  await addRequestEvent(tx, request, {
    type: "CREATED",
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
    at: now,
    details: { renewalOfPolicyId: policy.id },
  });
  return { requestId: request.id, code: request.code, created: true };
}

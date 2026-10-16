import { createHash } from "node:crypto";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { DbTransaction, Prisma } from "@astax/db";
import { canonicalJson } from "@astax/shared/audit";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";

/** Parameter values in force at `at` (CLAUDE.md rule 7). */
export { settingsAt } from "@astax/db";

/** Owner columns of a new row created by the caller (ADR 0007). */
export type OwnerColumns =
  | { ownerUserId: string; ownerOrganizationId: null }
  | { ownerUserId: null; ownerOrganizationId: string };

export function ownerOf(auth: AuthContext): OwnerColumns {
  if (auth.kind === "PRIVATE") return { ownerUserId: auth.userId, ownerOrganizationId: null };
  if (!auth.membership) throw new ProblemError("CONTEXT_REQUIRED");
  return { ownerUserId: null, ownerOrganizationId: auth.membership.organizationId };
}

/**
 * Requests the caller may see as requester (permission request.viewOwn): a
 * private user their own; a broker the organization's, an operator only the
 * ones of their own customers unless allowed to see all (VIS-13).
 */
export function requesterScope(auth: AuthContext): Prisma.QuoteRequestWhereInput {
  if (auth.kind === "PRIVATE") return { channel: "PRIVATE", ownerUserId: auth.userId };
  const membership = auth.membership;
  if (!membership || membership.organizationType !== "BROKER") throw new ProblemError("FORBIDDEN");
  const seesAll = membership.role === "OWNER" || membership.flags.seesAllClients;
  return {
    channel: "BROKER",
    ownerOrganizationId: membership.organizationId,
    ...(seesAll ? {} : { customer: { ownerMembershipId: membership.id } }),
  };
}

/** Broker customers the caller may see and manage (brokerCustomer.manage, VIS-13). */
export function customerScope(auth: AuthContext): Prisma.CustomerWhereInput {
  const membership = auth.membership;
  if (!membership || membership.organizationType !== "BROKER") throw new ProblemError("FORBIDDEN");
  const seesAll = membership.role === "OWNER" || membership.flags.seesAllClients;
  return {
    ownerOrganizationId: membership.organizationId,
    ...(seesAll ? {} : { ownerMembershipId: membership.id }),
  };
}

export function encryptJson(cipher: FieldCipher, value: unknown): string {
  return cipher.encrypt(JSON.stringify(value));
}

export function decryptJson(cipher: FieldCipher, value: string): unknown {
  return JSON.parse(cipher.decrypt(value)) as unknown;
}

export function sha256Of(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** Types of the request timeline (QuoteRequestEvent). */
export { addRequestEvent, type ActorKind, type RequestEventType } from "@astax/db";

/** Statuses in which the requester may still change the data. */
export const EDITABLE_STATUSES = ["DRAFT", "INTEGRATION_REQUESTED"] as const;

/** Fields read from a document, decrypted (ADR 0007: stored encrypted). */
export interface StoredExtraction {
  fields: Record<string, { value: string | number | boolean | null; confidence: number }>;
  warnings?: string[];
  model?: string;
  promptVersion?: string;
}

export function extractionOf(cipher: FieldCipher, value: string | null): StoredExtraction | null {
  return value ? (decryptJson(cipher, value) as StoredExtraction) : null;
}

/**
 * LEG-04: the customer's consent to share the request with the agencies is in
 * force. Once revoked, no new auction opens for that customer.
 */
export async function hasSharingConsent(
  tx: DbTransaction,
  customerId: string | null,
): Promise<boolean> {
  if (!customerId) return false;
  const consent = await tx.consent.findFirst({
    where: { customerId, type: "DATA_SHARING_AGENCIES", revokedAt: null },
    select: { id: true },
  });
  return consent !== null;
}

import { createHash } from "node:crypto";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { DbTransaction, Prisma } from "@astax/db";
import { canonicalJson } from "@astax/shared/audit";
import {
  requireSettingAt,
  type SettingKey,
  type SettingValue,
  type SettingVersion,
} from "@astax/shared/settings";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";

/** Parameter values in force at `at` (CLAUDE.md rule 7). */
export async function settingsAt<const K extends SettingKey>(
  tx: DbTransaction,
  keys: readonly K[],
  at: Date,
): Promise<{ [P in K]: SettingValue<P> }> {
  const rows = await tx.setting.findMany({ where: { key: { in: [...keys] } } });
  const versions = rows as unknown as SettingVersion[];
  const result = {} as { [P in K]: SettingValue<P> };
  for (const key of keys) result[key] = requireSettingAt(versions, key, at);
  return result;
}

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
export type RequestEventType =
  | "CREATED"
  | "DOCUMENT_ADDED"
  | "CONSENT_LINK_SENT"
  | "CONSENT_GIVEN"
  | "SUBMITTED"
  | "RESUBMITTED"
  | "AUTO_CHECKED"
  | "INTEGRATION_REQUESTED"
  | "CORRECTED"
  | "APPROVED"
  | "EXCLUDED"
  | "CANCELLED";

export type ActorKind = "REQUESTER" | "CUSTOMER" | "BACK_OFFICE" | "SYSTEM";

export async function addRequestEvent(
  tx: DbTransaction,
  request: { id: string; ownerUserId: string | null; ownerOrganizationId: string | null },
  event: {
    type: RequestEventType;
    actorKind: ActorKind;
    actorUserId: string | null;
    at: Date;
    details?: Record<string, string | number | boolean | null | string[]>;
  },
): Promise<void> {
  // createMany: no RETURNING, so a writer who cannot read the timeline still writes it.
  await tx.quoteRequestEvent.createMany({
    data: [
      {
        quoteRequestId: request.id,
        ownerUserId: request.ownerUserId,
        ownerOrganizationId: request.ownerOrganizationId,
        type: event.type,
        actorKind: event.actorKind,
        actorUserId: event.actorUserId,
        details: event.details ?? {},
        at: event.at,
      },
    ],
  });
}

/** Statuses in which the requester may still change the data. */
export const EDITABLE_STATUSES = ["DRAFT", "INTEGRATION_REQUESTED"] as const;

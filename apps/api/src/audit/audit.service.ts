import type { Clock } from "@astax/adapters/clock";
import {
  appendAudit,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbContext,
  type DbTransaction,
} from "@astax/db";
import type { AuditEntryContent } from "@astax/shared/audit";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context.js";
import { CLOCK, DB } from "../infra/tokens.js";

/** Audit actions written by the API. Stable names: reports and checks rely on them. */
export type AuditAction =
  | "ACCESS_DENIED"
  | "SEALED_BID_ACCESS_DENIED"
  | "USER_PROVISIONED"
  | "PROFILE_UPDATED"
  | "SESSION_REVOKED"
  | "ALL_SESSIONS_REVOKED"
  | "LOGIN"
  | "AUDIT_LOG_READ"
  | "TEAM_INVITE_CREATED"
  | "TEAM_INVITE_ACCEPTED"
  | "TEAM_INVITE_REVOKED"
  | "MEMBERSHIP_UPDATED"
  | "MEMBERSHIP_REMOVED"
  | "SETTING_CHANGED"
  | "LEGAL_ACCEPTED"
  | "LEGAL_VERSION_CREATED"
  | "LEGAL_VERSION_VALIDATED"
  | "REQUEST_CREATED"
  | "REQUEST_SUBMITTED"
  | "REQUEST_CANCELLED"
  | "DOCUMENT_VIEWED"
  | "QUOTE_DATA_VIEWED"
  | "QUOTE_DATA_CORRECTED"
  | "VERIFICATION_ASSIGNED"
  | "VERIFICATION_DECIDED"
  | "VERIFICATION_CHECKLIST_UPDATED"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_VIEWED"
  | "CONSENT_GIVEN"
  | "CONSENT_LINK_SENT"
  | "CONSENT_REVOKED"
  | "AGENCY_EXCLUDED_FROM_AUCTION"
  | "AGENCY_INCLUDED_IN_AUCTION"
  | "SEALED_BID_ACCESS_DENIED"
  | "AUCTION_CLAIMED"
  | "AUCTION_CLAIM_RELEASED"
  | "AUCTION_CLAIM_ASSIGNED"
  | "AUCTION_DECLINED"
  | "OFFER_SUBMITTED"
  | "OFFER_CHANGED"
  | "OFFER_WITHDRAWN"
  | "OFFER_OWNER_COPY_READ"
  | "OFFERS_VIEWED"
  | "AUCTION_EXTENSION_REQUESTED"
  | "AUCTION_INVITATIONS_REQUESTED"
  | "AUCTION_CANCELLATION_REQUESTED"
  | "AUCTION_REQUEST_NOT_DELIVERED"
  | "DEV_TOOL_USED"
  | "AGENCY_FILTERS_CHANGED"
  | "AGENCY_CAPACITY_CHANGED"
  | "MEMBER_FILTERS_CHANGED"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_DOCUMENT_UPLOADED"
  | "RECONFIRMATION_REQUESTED"
  | "OFFER_EXCLUDED_AFTER_REVIEW"
  | "OFFER_KEPT_AFTER_REVIEW"
  | "AI_COMPARISON_USED"
  | "CUSTOMER_LINK_SENT"
  | "CUSTOMER_LINK_OPENED"
  | "ACCEPTANCE_STARTED"
  | "ACCEPTANCE_SIGNED"
  | "PAYMENT_STARTED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "RANKING_PUBLISHED"
  | "CUSTOMER_CONTACTS_VIEWED"
  | "COMPLAINTS_INDEX_SET"
  | "ISSUANCE_DOCUMENT_UPLOADED"
  | "POLICY_ISSUED"
  | "ISSUANCE_PROBLEM_REPORTED"
  | "ISSUANCE_FAULT_DECIDED"
  | "SECOND_OFFER_DECIDED"
  | "PENALTY_PROPOSED"
  | "PENALTY_APPLIED"
  | "PENALTY_CANCELLED"
  | "PENALTY_CONTESTED"
  | "PENALTY_DECIDED"
  | "AGENCY_SUSPENDED"
  | "AGENCY_SUSPENSION_DECIDED"
  | "REMITTANCE_PREPARED"
  | "REMITTANCE_REVIEWED"
  | "REMITTANCE_FILE_GENERATED"
  | "REMITTANCE_EXECUTED"
  | "INVOICE_ISSUED"
  | "INVOICE_RECIPIENT_COMPLETED"
  | "INVOICES_VIEWED"
  | "STATEMENT_EXPORTED"
  | "REFUND_REQUESTED"
  | "REFUND_APPROVED"
  | "REFUND_REJECTED"
  | "WITHDRAWAL_REQUESTED"
  | "WITHDRAWAL_PRICED"
  | "RENEWAL_STARTED"
  | "AUTO_RENEWAL_SET"
  | "SURVEY_ANSWERED"
  | "FLAG_DECIDED"
  | "OTP_FAILED";

export interface AuditEvent {
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface AuditActor {
  userId: string | null;
  membershipId: string | null;
  organizationId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export function actorOf(auth: AuthContext): AuditActor {
  return {
    userId: auth.userId,
    membershipId: auth.membership?.id ?? null,
    organizationId: auth.membership?.organizationId ?? null,
    ip: auth.ip,
    userAgent: auth.userAgent,
  };
}

/**
 * Writes the audit log (SIC-04, CLAUDE.md rule 4). `inTransaction` joins the
 * caller's transaction, so the action and its record are saved together;
 * `record` writes on its own, for denials that have no transaction to join.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private content(actor: AuditActor, event: AuditEvent): AuditEntryContent {
    return {
      at: this.clock.now(),
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      actorOrganizationId: actor.organizationId,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      before: event.before ?? null,
      after: event.after ?? null,
      reason: event.reason ?? null,
      ip: actor.ip,
      userAgent: actor.userAgent,
    };
  }

  async inTransaction(tx: DbTransaction, actor: AuditActor, event: AuditEvent): Promise<void> {
    await appendAudit(tx, this.content(actor, event));
  }

  async record(
    actor: AuditActor,
    event: AuditEvent,
    context: DbContext = SYSTEM_CONTEXT,
  ): Promise<void> {
    await withContext(this.db, context, (tx) => appendAudit(tx, this.content(actor, event)));
  }
}

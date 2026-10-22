import { randomUUID } from "node:crypto";
import { SYNTHETIC } from "@astax/db/seed";
import { can, NO_FLAGS, type Action, type Actor } from "@astax/shared/permissions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptAllLegal,
  membershipId,
  startHarness,
  type Harness,
  type UserKey,
} from "./fixtures.js";

/**
 * SIC-01, fase 1 criterion: for every role, a table of the actions available in
 * this phase, allowed and denied, called over HTTP with real tokens, context and
 * database. Calls that would change data use invalid input, so an allowed call
 * stops at validation (400) or lookup (404) after the guard let it through.
 */
interface Endpoint {
  action: Action;
  method: string;
  path: () => string;
  body?: unknown;
  /** Professionals call it without X-AstAx-Context. */
  personal?: boolean;
  /** Offers: past the guard, the service answers 403 SEALED_BID to all but the owner. */
  sealed?: boolean;
}

const ENDPOINTS: Endpoint[] = [
  { action: "profile.view", method: "GET", path: () => "/me", personal: true },
  {
    action: "profile.update",
    method: "PATCH",
    path: () => "/me",
    body: { locale: "xx" },
    personal: true,
  },
  { action: "session.manageOwn", method: "GET", path: () => "/me/sessions", personal: true },
  {
    action: "session.manageOwn",
    method: "POST",
    path: () => "/me/sessions/logout-all",
    body: {},
    personal: true,
  },
  {
    action: "session.manageOwn",
    method: "POST",
    path: () => "/me/logins",
    body: {},
    personal: true,
  },
  {
    action: "session.manageOwn",
    method: "DELETE",
    path: () => `/me/sessions/${randomUUID()}`,
    personal: true,
  },
  { action: "legal.acceptOwn", method: "GET", path: () => "/legal/pending", personal: true },
  {
    action: "legal.acceptOwn",
    method: "POST",
    path: () => "/legal/acceptances",
    body: {},
    personal: true,
  },
  { action: "profile.view", method: "GET", path: () => "/me/invites", personal: true },
  {
    action: "profile.update",
    method: "POST",
    path: () => `/me/invites/${randomUUID()}/accept`,
    body: {},
    personal: true,
  },
  { action: "context.switch", method: "GET", path: () => "/context" },
  { action: "team.manage", method: "GET", path: () => "/team" },
  { action: "team.manage", method: "POST", path: () => "/team/invites", body: {} },
  { action: "team.manage", method: "DELETE", path: () => `/team/invites/${randomUUID()}` },
  { action: "team.manage", method: "PATCH", path: () => `/team/members/${randomUUID()}`, body: {} },
  { action: "team.manage", method: "DELETE", path: () => `/team/members/${randomUUID()}` },
  { action: "admin.settings.manage", method: "GET", path: () => "/admin/settings" },
  {
    action: "admin.notifications.manage",
    method: "GET",
    path: () => "/admin/notification-templates",
  },
  {
    action: "admin.notifications.manage",
    method: "GET",
    path: () => "/admin/notification-templates/auth.otp/history",
  },
  {
    action: "admin.notifications.manage",
    method: "PUT",
    path: () => "/admin/notification-templates/auth.otp",
    body: {},
  },
  {
    action: "admin.notifications.manage",
    method: "POST",
    path: () => "/admin/notification-templates/auth.otp/preview",
    body: {},
  },
  {
    action: "admin.notifications.manage",
    method: "POST",
    path: () => "/admin/notification-templates/auth.otp/test",
    body: {},
  },
  {
    action: "admin.notifications.manage",
    method: "POST",
    path: () => "/admin/communications",
    body: {},
  },
  {
    action: "admin.settings.manage",
    method: "GET",
    path: () => "/admin/settings/invitations.max/history",
  },
  {
    action: "admin.settings.manage",
    method: "PUT",
    path: () => "/admin/settings/invitations.max",
    body: {},
  },
  { action: "admin.settings.manage", method: "GET", path: () => "/admin/complaints-index" },
  {
    action: "admin.settings.manage",
    method: "PUT",
    path: () => "/admin/complaints-index",
    body: {},
  },
  {
    action: "admin.legal.manage",
    method: "POST",
    path: () => "/admin/legal/documents/none/versions",
    body: { contentMd: "x" },
  },
  {
    action: "admin.legal.manage",
    method: "POST",
    path: () => `/admin/legal/versions/${randomUUID()}/validate`,
    body: {},
  },
  { action: "admin.legal.manage", method: "GET", path: () => "/admin/legal/documents" },
  {
    action: "admin.legal.manage",
    method: "POST",
    path: () => `/admin/legal/versions/${randomUUID()}/publish`,
    body: {},
  },
  { action: "admin.users.manage", method: "POST", path: () => "/admin/users/search", body: {} },
  ...(["block", "unblock", "reset-second-factor"] as const).map((step) => ({
    action: "admin.users.manage" as const,
    method: "POST" as const,
    path: () => `/admin/users/${randomUUID()}/${step}`,
    body: {},
  })),
  {
    action: "admin.users.manage",
    method: "PUT",
    path: () => `/admin/users/${randomUUID()}/staff-role`,
    body: {},
  },
  { action: "admin.catalog.manage", method: "GET", path: () => "/admin/packages" },
  {
    action: "admin.catalog.manage",
    method: "POST",
    path: () => "/admin/packages/BASE/versions",
    body: {},
  },
  { action: "admin.catalog.manage", method: "GET", path: () => "/admin/exclusion-rules" },
  {
    action: "admin.catalog.manage",
    method: "POST",
    path: () => "/admin/exclusion-rules",
    body: {},
  },
  {
    action: "admin.catalog.manage",
    method: "PUT",
    path: () => "/admin/exclusion-rules/NONE",
    body: {},
  },
  { action: "admin.catalog.manage", method: "GET", path: () => "/admin/lists" },
  { action: "admin.catalog.manage", method: "POST", path: () => "/admin/lists/fuel", body: {} },
  { action: "admin.catalog.manage", method: "PUT", path: () => "/admin/lists/fuel/NONE", body: {} },
  { action: "admin.catalog.manage", method: "GET", path: () => "/admin/holidays?year=2029" },
  { action: "admin.catalog.manage", method: "POST", path: () => "/admin/holidays", body: {} },
  {
    action: "admin.catalog.manage",
    method: "POST",
    path: () => "/admin/holidays/confirm-year",
    body: {},
  },
  {
    action: "admin.catalog.manage",
    method: "POST",
    path: () => `/admin/holidays/${randomUUID()}/remove`,
    body: {},
  },
  {
    action: "organization.approveOnboarding",
    method: "GET",
    path: () => "/back-office/onboarding",
  },
  {
    action: "organization.approveOnboarding",
    method: "GET",
    path: () => `/back-office/onboarding/${randomUUID()}`,
  },
  {
    action: "organization.approveOnboarding",
    method: "GET",
    path: () => `/back-office/onboarding/${randomUUID()}/prof-insurance`,
  },
  ...(["approve", "reject"] as const).map((step) => ({
    action: "organization.approveOnboarding" as const,
    method: "POST" as const,
    path: () => `/back-office/onboarding/${randomUUID()}/${step}`,
    body: {},
  })),
  { action: "backOffice.dashboard", method: "GET", path: () => "/back-office/dashboard" },
  { action: "organization.suspend", method: "GET", path: () => "/back-office/organizations" },
  {
    action: "organization.suspend",
    method: "GET",
    path: () => `/back-office/organizations/${randomUUID()}`,
  },
  ...(["suspend", "reactivate", "notes"] as const).map((step) => ({
    action: "organization.suspend" as const,
    method: "POST" as const,
    path: () => `/back-office/organizations/${randomUUID()}/${step}`,
    body: {},
  })),
  { action: "organization.exclude", method: "GET", path: () => "/admin/exclusion-proposals" },
  {
    action: "organization.exclude",
    method: "POST",
    path: () => `/admin/exclusion-proposals/${randomUUID()}/decide`,
    body: {},
  },
  {
    action: "accessLog.viewCustomer",
    method: "POST",
    path: () => "/back-office/customers/search",
    body: {},
  },
  {
    action: "accessLog.viewCustomer",
    method: "GET",
    path: () => `/back-office/customers/${randomUUID()}`,
  },
  {
    action: "accessLog.viewCustomer",
    method: "GET",
    path: () => `/back-office/customers/${randomUUID()}/export`,
  },
  {
    action: "dataSubjectRequest.manage",
    method: "POST",
    path: () => `/back-office/customers/${randomUUID()}/data-requests`,
    body: {},
  },
  { action: "dataSubjectRequest.manage", method: "GET", path: () => "/back-office/data-requests" },
  {
    action: "dataSubjectRequest.manage",
    method: "POST",
    path: () => `/back-office/data-requests/${randomUUID()}/close`,
    body: {},
  },
  { action: "support.tickets", method: "GET", path: () => "/back-office/tickets" },
  { action: "support.tickets", method: "POST", path: () => "/back-office/tickets", body: {} },
  { action: "support.tickets", method: "GET", path: () => `/back-office/tickets/${randomUUID()}` },
  ...(["messages", "status", "assign"] as const).map((step) => ({
    action: "support.tickets" as const,
    method: "POST" as const,
    path: () => `/back-office/tickets/${randomUUID()}/${step}`,
    body: {},
  })),
  { action: "issuance.decideMissed", method: "GET", path: () => "/back-office/exceptions" },
  { action: "complaint.open", method: "GET", path: () => "/me/complaints", personal: true },
  {
    action: "complaint.open",
    method: "POST",
    path: () => "/me/complaints",
    body: {},
    personal: true,
  },
  { action: "complaint.manage", method: "GET", path: () => "/back-office/complaints" },
  { action: "complaint.register", method: "POST", path: () => "/back-office/complaints", body: {} },
  {
    action: "complaint.manage",
    method: "GET",
    path: () => "/back-office/complaints/export?from=2026-01-01&to=2026-12-31",
  },
  {
    action: "complaint.manage",
    method: "GET",
    path: () => `/back-office/complaints/${randomUUID()}`,
  },
  {
    action: "complaint.manage",
    method: "POST",
    path: () => `/back-office/complaints/${randomUUID()}/answer`,
    body: {},
  },
  {
    action: "payment.reconcile",
    method: "POST",
    path: () => "/back-office/reconciliation/statements",
    body: {},
  },
  {
    action: "accounting.view",
    method: "GET",
    path: () => "/back-office/reconciliation/statements",
  },
  { action: "accounting.view", method: "GET", path: () => "/back-office/reconciliation/lines" },
  ...(["match", "ignore", "reopen"] as const).map((step) => ({
    action: "payment.reconcile" as const,
    method: "POST" as const,
    path: () => `/back-office/reconciliation/lines/${randomUUID()}/${step}`,
    body: {},
  })),
  {
    action: "accounting.view",
    method: "GET",
    path: () => "/back-office/reconciliation/daily?from=2026-10-01&to=2026-10-31",
  },
  { action: "request.bulkUpload", method: "POST", path: () => "/broker/bulk-uploads", body: {} },
  // ADR 0014: the broker's lots from Excel.
  { action: "request.bulkUpload", method: "GET", path: () => "/broker/batches" },
  // Dan, 2026-10-21 (docs/piano-agenzie.md C, D).
  { action: "auction.viewStatus", method: "GET", path: () => "/agency/profile" },
  { action: "ranking.view", method: "GET", path: () => "/agency/metrics" },
  { action: "request.bulkUpload", method: "GET", path: () => "/broker/batches/template" },
  { action: "request.bulkUpload", method: "POST", path: () => "/broker/batches", body: {} },
  { action: "admin.settings.manage", method: "GET", path: () => "/admin/retention" },
  { action: "admin.settings.manage", method: "POST", path: () => "/admin/retention/run", body: {} },
  { action: "auditLog.viewAll", method: "GET", path: () => "/admin/audit" },
  {
    action: "auditLog.viewAll",
    method: "GET",
    path: () => "/admin/audit/export?from=2026-10-01&to=2026-10-31",
  },
  {
    action: "admin.reports.view",
    method: "GET",
    path: () => "/admin/dashboard?from=2026-10-01&to=2026-10-31",
  },
  { action: "admin.reports.view", method: "GET", path: () => "/admin/integrations" },
  {
    action: "admin.reports.view",
    method: "GET",
    path: () => "/admin/reports/requests?from=2026-10-01&to=2026-10-31",
  },
  {
    action: "admin.reports.view",
    method: "GET",
    path: () => "/admin/reports/accounting?from=2026-10-01&to=2026-10-31",
  },
  // Fase 2: requests, customers, consent
  { action: "request.create", method: "GET", path: () => "/reference/request-options" },
  { action: "profile.view", method: "GET", path: () => "/reference/municipalities?q=Mi" },
  { action: "request.create", method: "POST", path: () => "/vehicle-data/lookup", body: {} },
  { action: "request.viewOwn", method: "GET", path: () => "/requests" },
  { action: "consent.revoke", method: "GET", path: () => "/me/consents" },
  {
    action: "consent.revoke",
    method: "POST",
    path: () => `/consents/${randomUUID()}/revoke`,
    body: {},
  },
  { action: "request.create", method: "POST", path: () => "/requests", body: { customerId: "x" } },
  { action: "request.viewOwn", method: "GET", path: () => `/requests/${randomUUID()}` },
  {
    action: "request.create",
    method: "PUT",
    path: () => `/requests/${randomUUID()}/draft/special-uses`,
    body: {},
  },
  {
    action: "request.create",
    method: "PUT",
    path: () => `/requests/${randomUUID()}/draft/vehicle`,
    body: {},
  },
  { action: "request.create", method: "POST", path: () => `/requests/${randomUUID()}/documents` },
  {
    action: "request.viewOwn",
    method: "GET",
    path: () => `/requests/${randomUUID()}/documents/${randomUUID()}/file`,
  },
  {
    action: "request.create",
    method: "POST",
    path: () => `/requests/${randomUUID()}/submit`,
    body: {},
  },
  {
    action: "request.cancel",
    method: "POST",
    path: () => `/requests/${randomUUID()}/cancel`,
    body: {},
  },
  { action: "request.create", method: "GET", path: () => `/requests/${randomUUID()}/consent` },
  {
    action: "request.create",
    method: "POST",
    path: () => `/requests/${randomUUID()}/consent/code`,
    body: {},
  },
  {
    action: "request.create",
    method: "POST",
    path: () => `/requests/${randomUUID()}/consent/confirm`,
    body: {},
  },
  {
    action: "request.create",
    method: "POST",
    path: () => `/requests/${randomUUID()}/consent/accept`,
    body: {},
  },
  {
    action: "customerLink.send",
    method: "POST",
    path: () => `/requests/${randomUUID()}/consent/link`,
    body: {},
  },
  {
    action: "customerLink.send",
    method: "POST",
    path: () => `/requests/${randomUUID()}/customer-link`,
    body: { offerIds: [randomUUID()] },
  },
  {
    action: "customerLink.send",
    method: "GET",
    path: () => `/requests/${randomUUID()}/customer-link`,
  },
  {
    action: "brokerCustomer.manage",
    method: "POST",
    path: () => `/requests/${randomUUID()}/consent/uploaded`,
    body: {},
  },
  { action: "brokerCustomer.manage", method: "GET", path: () => "/customers" },
  { action: "brokerCustomer.manage", method: "POST", path: () => "/customers/search", body: {} },
  { action: "request.viewOwn", method: "POST", path: () => "/requests/search", body: { q: 1 } },
  { action: "brokerCustomer.manage", method: "POST", path: () => "/customers", body: {} },
  { action: "brokerCustomer.manage", method: "GET", path: () => `/customers/${randomUUID()}` },
  {
    action: "notification.viewOwn",
    method: "GET",
    path: () => "/me/notifications",
    personal: true,
  },
  {
    action: "notification.viewOwn",
    method: "POST",
    path: () => `/me/notifications/${randomUUID()}/read`,
    body: {},
    personal: true,
  },
  {
    action: "notification.viewOwn",
    method: "POST",
    path: () => "/me/notifications/read-all",
    body: {},
    personal: true,
  },
  {
    action: "notification.viewOwn",
    method: "GET",
    path: () => "/me/notifications/preferences",
    personal: true,
  },
  {
    action: "notification.viewOwn",
    method: "PUT",
    path: () => "/me/notifications/preferences",
    body: {},
    personal: true,
  },
  {
    action: "notification.viewOwn",
    method: "POST",
    path: () => "/me/notifications/push-subscriptions",
    body: {},
    personal: true,
  },
  {
    action: "notification.viewOwn",
    method: "POST",
    path: () => "/me/notifications/push-subscriptions/revoke",
    body: {},
    personal: true,
  },
  // Fase 2: back office verification
  { action: "verification.viewQueue", method: "GET", path: () => "/verification/queue" },
  {
    action: "verification.viewQueue",
    method: "GET",
    path: () => `/verification/requests/${randomUUID()}/agencies`,
  },
  {
    action: "verification.excludeAgency",
    method: "POST",
    path: () => `/verification/requests/${randomUUID()}/agencies/${randomUUID()}/exclude`,
    body: { reason: "motivo" },
  },
  {
    action: "verification.excludeAgency",
    method: "POST",
    path: () => `/verification/requests/${randomUUID()}/agencies/${randomUUID()}/include`,
    body: {},
  },
  {
    action: "verification.viewQueue",
    method: "GET",
    path: () => `/verification/requests/${randomUUID()}`,
  },
  {
    action: "verification.viewQueue",
    method: "GET",
    path: () => `/verification/requests/${randomUUID()}/documents/${randomUUID()}/file`,
  },
  {
    action: "verification.decide",
    method: "POST",
    path: () => `/verification/requests/${randomUUID()}/assign`,
    body: {},
  },
  {
    action: "verification.decide",
    method: "PUT",
    path: () => `/verification/requests/${randomUUID()}/checklist/DOCUMENTS`,
    body: {},
  },
  {
    action: "verification.decide",
    method: "POST",
    path: () => `/verification/requests/${randomUUID()}/corrections`,
    body: {},
  },
  {
    action: "verification.decide",
    method: "POST",
    path: () => `/verification/requests/${randomUUID()}/approve`,
    body: {},
  },
  {
    action: "verification.decide",
    method: "POST",
    path: () => `/verification/requests/${randomUUID()}/integration`,
    body: {},
  },
  {
    action: "verification.decide",
    method: "POST",
    path: () => `/verification/requests/${randomUUID()}/exclude`,
    body: {},
  },
  // Fase 3: auctions and offers
  { action: "auction.viewStatus", method: "GET", path: () => `/requests/${randomUUID()}/auction` },
  { action: "offers.viewPresented", method: "GET", path: () => `/requests/${randomUUID()}/offers` },
  {
    action: "reconfirmation.request",
    method: "POST",
    path: () => `/requests/${randomUUID()}/reconfirmation`,
    body: {},
  },
  { action: "auction.viewStatus", method: "GET", path: () => "/agency/dashboard" },
  { action: "auction.viewStatus", method: "GET", path: () => "/agency/requests" },
  {
    action: "request.viewQuoteData",
    method: "GET",
    path: () => `/agency/requests/${randomUUID()}`,
  },
  {
    action: "request.viewQuoteData",
    method: "GET",
    path: () => `/agency/requests/${randomUUID()}/documents/${randomUUID()}`,
  },
  {
    action: "claim.override",
    method: "POST",
    path: () => `/agency/requests/${randomUUID()}/assign`,
    body: { membershipId: randomUUID() },
  },
  { action: "offer.readOwnDuringAuction", method: "GET", path: () => "/agency/offers" },
  // Fase 5: the acceptance
  {
    action: "offers.viewPresented",
    method: "GET",
    path: () => `/requests/${randomUUID()}/offers/${randomUUID()}/quote`,
  },
  { action: "issuance.manage", method: "GET", path: () => "/agency/to-issue" },
  { action: "issuance.manage", method: "GET", path: () => `/agency/issuance/${randomUUID()}` },
  {
    action: "issuance.manage",
    method: "POST",
    path: () => `/agency/issuance/${randomUUID()}/documents/ISSUED_POLICY`,
    body: {},
  },
  {
    action: "issuance.manage",
    method: "GET",
    path: () => `/agency/issuance/${randomUUID()}/documents/${randomUUID()}`,
  },
  {
    action: "issuance.manage",
    method: "POST",
    path: () => `/agency/issuance/${randomUUID()}/issue`,
    body: {},
  },
  {
    action: "issuance.manage",
    method: "POST",
    path: () => `/agency/issuance/${randomUUID()}/problem`,
    body: {},
  },
  { action: "issuance.manage", method: "GET", path: () => "/agency/policies" },
  { action: "ranking.view", method: "GET", path: () => "/agency/results" },
  {
    action: "request.create",
    method: "POST",
    path: () => `/policies/${randomUUID()}/renew`,
    body: {},
  },
  {
    action: "request.create",
    method: "POST",
    path: () => `/policies/${randomUUID()}/auto-renewal`,
    body: {},
  },
  { action: "request.create", method: "POST", path: () => "/broker/renewals/bulk", body: {} },
  { action: "request.viewOwn", method: "GET", path: () => "/broker/renewals" },
  {
    action: "withdrawal.request",
    method: "POST",
    path: () => `/policies/${randomUUID()}/withdrawal`,
    body: {},
  },
  { action: "withdrawal.manage", method: "GET", path: () => "/back-office/withdrawals" },
  { action: "complaint.manage", method: "GET", path: () => "/back-office/flags" },
  {
    action: "complaint.manage",
    method: "POST",
    path: () => `/back-office/flags/${randomUUID()}/decide`,
    body: {},
  },
  {
    action: "withdrawal.manage",
    method: "POST",
    path: () => `/back-office/policies/${randomUUID()}/withdrawal`,
    body: {},
  },
  {
    action: "withdrawal.indicateRefundablePremium",
    method: "GET",
    path: () => "/agency/withdrawals",
  },
  {
    action: "withdrawal.indicateRefundablePremium",
    method: "POST",
    path: () => `/agency/withdrawals/${randomUUID()}/price`,
    body: {},
  },
  { action: "request.viewOwn", method: "GET", path: () => "/policies" },
  { action: "issuance.decideMissed", method: "GET", path: () => "/back-office/issuance-problems" },
  {
    action: "issuance.decideMissed",
    method: "POST",
    path: () => `/back-office/issuance-problems/${randomUUID()}/decide`,
    body: {},
  },
  { action: "accounting.view", method: "GET", path: () => "/back-office/refunds" },
  { action: "accounting.view", method: "GET", path: () => "/back-office/remittances" },
  { action: "accounting.view", method: "GET", path: () => "/back-office/invoices" },
  {
    action: "accounting.view",
    method: "GET",
    path: () => `/back-office/invoices/${randomUUID()}/pdf`,
  },
  {
    action: "remittance.execute",
    method: "POST",
    path: () => "/back-office/remittances/prepare",
    body: {},
  },
  {
    action: "remittance.execute",
    method: "POST",
    path: () => `/back-office/remittances/${randomUUID()}/review`,
    body: {},
  },
  {
    action: "remittance.execute",
    method: "POST",
    path: () => "/back-office/remittances/file",
    body: {},
  },
  {
    action: "remittance.execute",
    method: "GET",
    path: () => `/back-office/remittances/${randomUUID()}/file`,
  },
  {
    action: "remittance.execute",
    method: "POST",
    path: () => `/back-office/remittances/${randomUUID()}/execute`,
    body: {},
  },
  {
    action: "remittance.execute",
    method: "POST",
    path: () => `/back-office/invoices/${randomUUID()}/recipient`,
    body: {},
  },
  {
    action: "remittance.execute",
    method: "POST",
    path: () => "/back-office/invoices/broker-month",
    body: {},
  },
  { action: "accounting.agencyStatement", method: "GET", path: () => "/agency/statement" },
  { action: "accounting.brokerStatement", method: "GET", path: () => "/broker/statement" },
  { action: "accounting.brokerStatement", method: "GET", path: () => "/broker/statement/csv" },
  { action: "invoice.viewOwn", method: "GET", path: () => "/invoices" },
  { action: "invoice.viewOwn", method: "GET", path: () => `/invoices/${randomUUID()}/pdf` },
  {
    action: "penalty.propose",
    method: "GET",
    path: () => "/back-office/penalties",
  },
  {
    action: "penalty.propose",
    method: "POST",
    path: () => "/back-office/penalties",
    body: {},
  },
  {
    action: "penalty.apply",
    method: "POST",
    path: () => `/back-office/penalties/${randomUUID()}/apply`,
    body: {},
  },
  {
    action: "penalty.apply",
    method: "POST",
    path: () => `/back-office/penalties/${randomUUID()}/cancel`,
    body: {},
  },
  {
    action: "penalty.contest",
    method: "GET",
    path: () => "/agency/penalties",
  },
  {
    action: "penalty.contest",
    method: "POST",
    path: () => `/agency/penalties/${randomUUID()}/contest`,
    body: {},
  },
  {
    action: "penalty.decideContest",
    method: "GET",
    path: () => "/admin/penalties",
  },
  {
    action: "penalty.decideContest",
    method: "POST",
    path: () => `/admin/penalties/${randomUUID()}/decide`,
    body: {},
  },
  {
    action: "organization.suspend",
    method: "GET",
    path: () => "/admin/suspensions",
  },
  {
    action: "organization.suspend",
    method: "POST",
    path: () => `/admin/suspensions/${randomUUID()}/decide`,
    body: {},
  },
  {
    action: "refund.approve",
    method: "POST",
    path: () => `/back-office/refunds/${randomUUID()}/approve`,
    body: {},
  },
  {
    action: "refund.approve",
    method: "POST",
    path: () => `/back-office/refunds/${randomUUID()}/reject`,
    body: {},
  },
  {
    action: "offers.viewPresented",
    method: "GET",
    path: () => `/requests/${randomUUID()}/next-offer`,
  },
  {
    action: "offer.accept",
    method: "POST",
    path: () => `/requests/${randomUUID()}/next-offer/confirm`,
    body: {},
  },
  {
    action: "offer.accept",
    method: "POST",
    path: () => `/requests/${randomUUID()}/next-offer/refuse`,
    body: {},
  },
  {
    action: "offers.viewPresented",
    method: "GET",
    path: () => `/requests/${randomUUID()}/presentation`,
  },
  {
    action: "aiComparison.use",
    method: "POST",
    path: () => `/requests/${randomUUID()}/ai-comparison`,
    body: {},
  },
  {
    action: "offers.viewPresented",
    method: "GET",
    path: () => `/requests/${randomUUID()}/acceptance`,
  },
  {
    action: "offer.accept",
    method: "POST",
    path: () => `/requests/${randomUUID()}/acceptance`,
    body: {},
  },
  {
    action: "offer.accept",
    method: "POST",
    path: () => `/requests/${randomUUID()}/acceptance/payment`,
    body: {},
  },
  {
    action: "offers.viewPresented",
    method: "GET",
    path: () => `/requests/${randomUUID()}/acceptance/documents/${randomUUID()}`,
  },
  // Fase 4: OFF-09 decisions on the PDF quotes
  { action: "offer.excludeAfterPdfCheck", method: "GET", path: () => "/back-office/quote-checks" },
  {
    action: "offer.excludeAfterPdfCheck",
    method: "POST",
    path: () => `/back-office/quote-checks/${randomUUID()}/decision`,
    body: {},
  },
  // Fase 4: filters, capacity, product library, access log
  { action: "memberFilters.manageOwn", method: "GET", path: () => "/agency/filters" },
  { action: "agencyFilters.manage", method: "PUT", path: () => "/agency/filters", body: {} },
  { action: "agencyFilters.manage", method: "PUT", path: () => "/agency/capacity", body: {} },
  {
    action: "memberFilters.manageOwn",
    method: "PUT",
    path: () => "/agency/filters/mine",
    body: {},
  },
  { action: "offer.submit", method: "GET", path: () => "/agency/products" },
  { action: "productLibrary.manage", method: "POST", path: () => "/agency/products", body: {} },
  {
    action: "productLibrary.manage",
    method: "PATCH",
    path: () => `/agency/products/${randomUUID()}`,
    body: {},
  },
  {
    action: "productLibrary.manage",
    method: "POST",
    path: () => `/agency/products/${randomUUID()}/documents`,
    body: {},
  },
  {
    action: "offer.submit",
    method: "GET",
    path: () => `/agency/products/${randomUUID()}/documents/${randomUUID()}`,
  },
  { action: "accessLog.viewOwnAgency", method: "GET", path: () => "/agency/access-log" },
  {
    action: "claim.manage",
    method: "POST",
    path: () => `/auctions/${randomUUID()}/claim`,
    body: {},
  },
  {
    action: "claim.manage",
    method: "POST",
    path: () => `/auctions/${randomUUID()}/release`,
    body: {},
  },
  {
    action: "claim.manage",
    method: "POST",
    path: () => `/auctions/${randomUUID()}/decline`,
    body: {},
  },
  {
    action: "offer.submit",
    method: "POST",
    path: () => `/auctions/${randomUUID()}/offers`,
    body: {},
  },
  { action: "offer.submit", method: "PUT", path: () => `/offers/${randomUUID()}`, body: {} },
  {
    action: "offer.submit",
    method: "POST",
    path: () => `/offers/${randomUUID()}/withdraw`,
    body: {},
  },
  // Any role may ask; the service answers 403 SEALED_BID to all but the owner (BC-01).
  {
    action: "auction.viewStatus",
    method: "GET",
    path: () => `/offers/${randomUUID()}`,
    sealed: true,
  },
  {
    action: "auction.viewStatus",
    method: "GET",
    path: () => `/offers/${randomUUID()}/pdf`,
    sealed: true,
  },
  {
    action: "auction.viewStatus",
    method: "GET",
    path: () => `/auctions/${randomUUID()}/offers`,
    sealed: true,
  },
  { action: "auction.viewStatus", method: "GET", path: () => "/auctions" },
  { action: "notification.viewOwn", method: "POST", path: () => "/realtime/ticket", body: {} },
  // rule 13: with DEV_TOOLS=false (the tests) the allowed roles get 404.
  {
    action: "devTools.use",
    method: "POST",
    path: () => `/dev/requests/${randomUUID()}/fire-next-timer`,
    body: {},
  },
  {
    action: "devTools.use",
    method: "POST",
    path: () => `/dev/auctions/${randomUUID()}/test-offers`,
    body: {},
  },
  {
    action: "devTools.use",
    method: "POST",
    path: () => "/dev/clock",
    body: { advanceMinutes: 60 },
  },
  {
    action: "auction.manage",
    method: "POST",
    path: () => `/auctions/${randomUUID()}/extend`,
    body: { workingHours: 1, reason: "motivo" },
  },
  {
    action: "auction.manage",
    method: "POST",
    path: () => `/auctions/${randomUUID()}/invite`,
    body: { organizationIds: [randomUUID()], reason: "motivo" },
  },
  {
    action: "auction.manage",
    method: "POST",
    path: () => `/auctions/${randomUUID()}/cancel`,
    body: { reason: "motivo" },
  },
];

/**
 * Routes without authentication: the consent page the broker's customer opens
 * from the link (the secret token is the proof). Tested in requests.int.test.ts.
 */
const PUBLIC_ROUTES = [
  // ADR 0016: the public home, read only, anonymous or aggregate data. Tested in public-home.int.test.ts.
  "GET /public/home",
  "POST /webhooks/signature",
  "POST /webhooks/payments",
  "POST /webhooks/sdi",
  "GET /fake-providers/signature/{ref}",
  "POST /fake-providers/signature/{ref}/sign",
  "GET /fake-providers/payments/{ref}",
  "POST /fake-providers/payments/{ref}/pay",
  "POST /fake-providers/payments/{ref}/confirm",
  "GET /surveys/{token}",
  "POST /surveys/{token}",
  "GET /consent-links/{token}",
  "POST /consent-links/{token}/code",
  "POST /consent-links/{token}/confirm",
  "GET /customer-links/{token}",
  "POST /customer-links/{token}/code",
  "POST /customer-links/{token}/confirm",
  "POST /customer-links/{token}/acceptance",
  "POST /customer-links/{token}/acceptance/payment",
  "GET /customer-links/{token}/acceptance/documents/{documentId}",
  "GET /customer-links/{token}/offers/{offerId}/quote",
  // Phase 7: the entry of agencies and brokers, on its private link.
  "GET /onboarding/options",
  "POST /onboarding",
  "GET /onboarding/{token}",
  "PUT /onboarding/{token}",
  "POST /onboarding/{token}/iban-code",
  "POST /onboarding/{token}/iban-confirm",
  "POST /onboarding/{token}/prof-insurance",
  "POST /onboarding/{token}/submit",
];

/** One synthetic user per role, with the membership the seed gives them. */
const ROLE_USERS: { key: UserKey; org: string | null }[] = [
  { key: "private-giulia-neri", org: null },
  { key: "broker-owner", org: "broker-demo" },
  { key: "broker-operator", org: "broker-demo" },
  { key: "agenzia-uno-owner", org: "agenzia-uno" },
  { key: "agenzia-uno-supervisor", org: "agenzia-uno" },
  { key: "agenzia-uno-operator", org: "agenzia-uno" },
  { key: "bo-verifier", org: "astax" },
  { key: "bo-support", org: "astax" },
  { key: "bo-accounting", org: "astax" },
  { key: "bo-supervisor", org: "astax" },
  { key: "admin", org: "astax" },
];

function actorOf(key: UserKey, org: string | null): Actor {
  if (!org) return { kind: "PRIVATE" };
  const membership = SYNTHETIC.memberships.find((m) => m.user === key && m.organization === org);
  const organization = SYNTHETIC.organizations.find((o) => o.key === org);
  if (!membership || !organization) throw new Error(`No membership for ${key}`);
  return {
    kind: "MEMBER",
    role: membership.role,
    organizationType: organization.type,
    flags: {
      ...NO_FLAGS,
      canIssue: membership.canIssue ?? false,
      canSeeColleagueOffers: membership.canSeeColleagueOffers ?? false,
      canSeeAccounting: membership.canSeeAccounting ?? false,
      seesAllClients: membership.seesAllClients ?? false,
    },
  };
}

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
  for (const { key } of ROLE_USERS) await acceptAllLegal(h, key);
});

afterAll(async () => {
  await h.close();
});

describe("SIC-01 every API route is in the table", () => {
  it("the routes published in OpenAPI are exactly the table's, apart from the public health check", async () => {
    const document = (await (await h.call("/openapi.json")).json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const published = Object.entries(document.paths)
      .flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
      )
      .filter((route) => route !== "GET /health" && !PUBLIC_ROUTES.includes(route))
      .sort();
    const covered = [
      ...new Set(
        ENDPOINTS.map(
          (e) =>
            `${e.method} ${e
              .path()
              .replace(/\?.*$/, "")
              .replace(/[0-9a-f-]{36}/g, "{id}")
              .replace("/documents/{id}/file", "/documents/{documentId}/file")
              .replace(/\/acceptance\/documents\/\{id\}$/, "/acceptance/documents/{documentId}")
              .replace(/\/offers\/\{id\}\/quote$/, "/offers/{offerId}/quote")
              .replace("/agencies/{id}/", "/agencies/{organizationId}/")
              .replace(
                "/agency/requests/{id}/documents/{id}",
                "/agency/requests/{auctionId}/documents/{documentId}",
              )
              .replace("/agency/requests/{id}", "/agency/requests/{auctionId}")
              .replace(
                /\/agency\/products\/\{id\}\/documents\/\{id\}$/,
                "/agency/products/{id}/documents/{documentId}",
              )
              .replace(
                "/agency/issuance/{id}/documents/{id}",
                "/agency/issuance/{requestId}/documents/{documentId}",
              )
              .replace(
                "/agency/issuance/{id}/documents/ISSUED_POLICY",
                "/agency/issuance/{requestId}/documents/{kind}",
              )
              .replace("/agency/issuance/{id}", "/agency/issuance/{requestId}")
              .replace("/draft/vehicle", "/draft/{section}")
              .replace("/checklist/DOCUMENTS", "/checklist/{code}")
              .replace("/documents/none/", "/documents/{key}/")
              .replace("/settings/invitations.max", "/settings/{key}")
              .replace("/notification-templates/auth.otp", "/notification-templates/{key}")
              .replace("/packages/BASE/", "/packages/{code}/")
              .replace("/exclusion-rules/NONE", "/exclusion-rules/{code}")
              .replace("/lists/fuel/NONE", "/lists/{listKey}/{code}")
              .replace(/\/lists\/fuel$/, "/lists/{listKey}")
              .replace(/\?year=\d+$/, "")}`,
        ),
      ),
    ].sort();
    expect(published).toEqual(covered);
  });
});

describe("SIC-01 permission table over HTTP, role by role", () => {
  for (const { key, org } of ROLE_USERS) {
    describe(key, () => {
      for (const endpoint of ENDPOINTS) {
        const allowed = can(actorOf(key, org), endpoint.action);
        it(`${allowed ? "may" : "may not"} ${endpoint.method} ${endpoint.path().replace(/[0-9a-f-]{36}/, ":id")} (${endpoint.action})`, async () => {
          const token = await h.tokenFor(key);
          const response = await h.call(endpoint.path(), {
            token,
            method: endpoint.method,
            ...(endpoint.body === undefined ? {} : { body: endpoint.body }),
            ...(org && !endpoint.personal ? { context: membershipId(key, org) } : {}),
          });
          if (allowed && endpoint.sealed) {
            // The guard lets the role through; the service may still refuse the sealed bid.
            const body = (await response.clone().json()) as { code?: string };
            expect(body.code, JSON.stringify(body)).not.toBe("FORBIDDEN");
            expect(response.status).toBeLessThan(500);
          } else if (allowed) {
            expect(response.status, await response.clone().text()).not.toBe(403);
            expect(response.status).toBeLessThan(500);
          } else {
            expect(response.status).toBe(403);
          }
        });
      }
    });
  }

  it("admin and back office never read sealed offers: the action is granted to nobody (BC-01)", () => {
    for (const { key, org } of ROLE_USERS)
      expect(can(actorOf(key, org), "offer.readSealed")).toBe(false);
  });
});

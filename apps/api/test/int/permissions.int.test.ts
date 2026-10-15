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
  { action: "auditLog.viewAll", method: "GET", path: () => "/admin/audit" },
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
          if (allowed) {
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

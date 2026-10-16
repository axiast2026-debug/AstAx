import { OutboxRunner } from "../../src/outbox/outbox-runner.js";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptAllLegal,
  membershipId,
  orgId,
  startHarness,
  userId,
  type Harness,
} from "./fixtures.js";

let h: Harness;
let ownerToken: string;
const ownerContext = () => membershipId("agenzia-sei-owner", "agenzia-sei");

beforeAll(async () => {
  h = await startHarness();
  await acceptAllLegal(h, "agenzia-sei-owner");
  ownerToken = await h.tokenFor("agenzia-sei-owner");
});

afterAll(async () => {
  await h.close();
});

const call = (path: string, options: { method?: string; body?: unknown } = {}) =>
  h.call(path, { token: ownerToken, context: ownerContext(), ...options });

describe("fase 1 passo 8: team", () => {
  it("the owner sees the team of the active organization only", async () => {
    const team = (await (await call("/team")).json()) as {
      members: { userId: string; role: string }[];
    };
    expect(team.members.map((m) => m.role).sort()).toEqual(["OPERATOR", "OWNER", "SUPERVISOR"]);
    expect(team.members.map((m) => m.userId)).not.toContain(userId("agenzia-uno-owner"));
  });

  it("invites a new person: Keycloak user with password and TOTP to set, joins at first login", async () => {
    const response = await call("/team/invites", {
      body: {
        email: "bianca.nuova@agenzia-sei.test",
        firstName: "Bianca",
        lastName: "Nuova",
        role: "OPERATOR",
        flags: { canIssue: true },
      },
    });
    expect(response.status).toBe(201);
    const actions = h.identity.calls.find((c) => c.method === "executeActionsEmail");
    expect(actions?.args[1]).toEqual(["UPDATE_PASSWORD", "CONFIGURE_TOTP"]);
    expect(h.identity.calls.find((c) => c.method === "addRealmRoles")?.args[1]).toEqual([
      "astax-professional",
    ]);

    // First login of the invited person: the membership is created from the invitation.
    const token = await h.token({
      sub: h.identity.users.get("bianca.nuova@agenzia-sei.test") ?? "",
      azp: "astax-web-pro",
      roles: ["astax-professional"],
      email: "bianca.nuova@agenzia-sei.test",
      givenName: "Bianca",
      familyName: "Nuova",
    });
    const me = (await (await h.call("/me", { token })).json()) as {
      memberships: { role: string; organization: { name: string }; flags: { canIssue: boolean } }[];
    };
    expect(me.memberships).toEqual([
      expect.objectContaining({
        role: "OPERATOR",
        organization: expect.objectContaining({ name: "Agenzia Sei" }),
      }),
    ]);
    expect(me.memberships[0]?.flags.canIssue).toBe(true);
  });

  it("refuses to invite an address that belongs to a private customer, writing nothing", async () => {
    const email = "cliente.privato@example.test";
    h.identity.users.set(email, "kc-some-private");
    h.identity.roles.set("kc-some-private", ["astax-private"]);
    const before = await withContext(h.db, SYSTEM_CONTEXT, (tx) => tx.teamInvite.count());
    const response = await call("/team/invites", {
      body: { email, firstName: "Cliente", lastName: "Privato", role: "OPERATOR" },
    });
    expect(response.status).toBe(409);
    expect(await withContext(h.db, SYSTEM_CONTEXT, (tx) => tx.teamInvite.count())).toBe(before);
  });

  it("refuses roles and flags that do not exist for an agency", async () => {
    const wrongRole = await call("/team/invites", {
      body: { email: "x@agenzia-sei.test", firstName: "X", lastName: "Y", role: "OWNER" },
    });
    expect(wrongRole.status).toBe(400);
    const wrongFlag = await call("/team/invites", {
      body: {
        email: "x@agenzia-sei.test",
        firstName: "X",
        lastName: "Y",
        role: "SUPERVISOR",
        flags: { canIssue: true },
      },
    });
    expect(wrongFlag.status).toBe(400);
    expect(await wrongFlag.text()).toContain("FLAG_NOT_APPLICABLE:canIssue");
  });

  it("changes flags, suspends and removes a member, with before and after in the audit log", async () => {
    const operator = membershipId("agenzia-sei-operator", "agenzia-sei");
    const updated = await call(`/team/members/${operator}`, {
      method: "PATCH",
      body: { flags: { canSeeColleagueOffers: true } },
    });
    expect(updated.status).toBe(200);
    expect(
      ((await updated.json()) as { flags: { canSeeColleagueOffers: boolean } }).flags
        .canSeeColleagueOffers,
    ).toBe(true);

    expect(
      (await call(`/team/members/${operator}`, { method: "PATCH", body: { status: "SUSPENDED" } }))
        .status,
    ).toBe(200);
    const entry = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findFirst({
        where: { action: "MEMBERSHIP_UPDATED", targetId: operator },
        orderBy: { seq: "desc" },
      }),
    );
    expect(entry?.before).toMatchObject({ status: "ACTIVE" });
    expect(entry?.after).toMatchObject({ status: "SUSPENDED" });

    expect((await call(`/team/members/${operator}`, { method: "DELETE" })).status).toBe(204);
    const removed = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.membership.findUnique({ where: { id: operator } }),
    );
    expect(removed?.status).toBe("REMOVED");
  });

  it("the owner cannot edit their own membership, nor touch another organization's members", async () => {
    expect(
      (
        await call(`/team/members/${ownerContext()}`, {
          method: "PATCH",
          body: { status: "SUSPENDED" },
        })
      ).status,
    ).toBe(403);
    const foreign = membershipId("agenzia-uno-operator", "agenzia-uno");
    expect((await call(`/team/members/${foreign}`, { method: "DELETE" })).status).toBe(404);
    const stillActive = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.membership.findUnique({ where: { id: foreign } }),
    );
    expect(stillActive?.status).toBe("ACTIVE");
  });

  it("an existing professional accepts an invitation and gets a second context", async () => {
    await acceptAllLegal(h, "agenzia-due-operator");
    const cesare = await h.tokenFor("agenzia-due-operator");
    const email = "cesare.pellegrini@agenzia-due.test";
    h.identity.users.set(email, "kc-agenzia-due-operator");
    expect(
      (
        await call("/team/invites", {
          body: { email, firstName: "Cesare", lastName: "Pellegrini", role: "OPERATOR" },
        })
      ).status,
    ).toBe(201);
    expect(h.email.sent.at(-1)).toMatchObject({
      to: email,
      subject: "Agenzia Sei ti invita su AstAx",
    });

    const invites = (await (await h.call("/me/invites", { token: cesare })).json()) as {
      id: string;
    }[];
    expect(invites).toHaveLength(1);
    const accepted = await h.call(`/me/invites/${invites[0]?.id}/accept`, {
      token: cesare,
      body: {},
    });
    expect(accepted.status).toBe(201);
    const me = (await (await h.call("/me", { token: cesare })).json()) as {
      memberships: { organization: { id: string } }[];
    };
    expect(me.memberships.map((m) => m.organization.id)).toEqual([
      orgId("agenzia-due"),
      orgId("agenzia-sei"),
    ]);
  });
});

describe("fase 1 passo 9: events of team changes", () => {
  it("a membership change writes a domain event and an outbox event, delivered by the dispatcher", async () => {
    const supervisor = membershipId("agenzia-sei-supervisor", "agenzia-sei");
    const response = await h.call(`/team/members/${supervisor}`, {
      token: ownerToken,
      context: ownerContext(),
      method: "PATCH",
      body: { flags: { canSeeAccounting: false } },
    });
    expect(response.status).toBe(200);
    const event = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.domainEvent.findFirst({ where: { aggregateId: supervisor, type: "membership.updated" } }),
    );
    expect(event?.data).toEqual({ role: "SUPERVISOR", status: "ACTIVE" });

    await h.app.get(OutboxRunner).tick();
    const pending = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.outboxEvent.count({ where: { status: "PENDING", type: "membership.updated" } }),
    );
    expect(pending).toBe(0);
  });
});

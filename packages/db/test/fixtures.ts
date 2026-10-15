import { inject } from "vitest";
import {
  createDbClient,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbContext,
} from "../src/index.js";

export const appDb = (): DbClient => createDbClient(inject("dbAppUrl"));
export const ownerDb = (): DbClient => createDbClient(inject("dbOwnerUrl"));
export const superDb = (): DbClient => createDbClient(inject("dbSuperUrl"));

/** Synthetic organizations and users (SIC-08), created once per test file. */
export interface World {
  astax: string;
  agenziaUno: string;
  agenziaDue: string;
  agenziaTre: string;
  ownerUno: string;
  ownerDue: string;
  marcoRossi: string;
  boVerifier: string;
  giuliaNeri: string;
}

let counter = 0;

export async function createWorld(db: DbClient): Promise<World> {
  counter += 1;
  const tag = `${counter}-${Math.random().toString(36).slice(2, 8)}`;
  return withContext(db, SYSTEM_CONTEXT, async (tx) => {
    const org = async (type: "AGENCY" | "ASTAX", legalName: string) =>
      (await tx.organization.create({ data: { type, legalName, status: "ACTIVE" } })).id;
    const user = async (
      kind: "PRIVATE" | "PROFESSIONAL" | "STAFF",
      firstName: string,
      lastName: string,
    ) =>
      (
        await tx.user.create({
          data: { kind, firstName, lastName, keycloakId: `kc-${firstName}-${tag}` },
        })
      ).id;

    const world: World = {
      astax: await org("ASTAX", `AstAx ${tag}`),
      agenziaUno: await org("AGENCY", `Agenzia Uno ${tag}`),
      agenziaDue: await org("AGENCY", `Agenzia Due ${tag}`),
      agenziaTre: await org("AGENCY", `Agenzia Tre ${tag}`),
      ownerUno: await user("PROFESSIONAL", "Anna", "Uno"),
      ownerDue: await user("PROFESSIONAL", "Bruno", "Due"),
      marcoRossi: await user("PROFESSIONAL", "Marco", "Rossi"),
      boVerifier: await user("STAFF", "Elsa", "Verifica"),
      giuliaNeri: await user("PRIVATE", "Giulia", "Neri"),
    };
    await tx.membership.createMany({
      data: [
        { userId: world.ownerUno, organizationId: world.agenziaUno, role: "OWNER" },
        { userId: world.ownerDue, organizationId: world.agenziaDue, role: "OWNER" },
        { userId: world.marcoRossi, organizationId: world.agenziaUno, role: "OPERATOR" },
        { userId: world.marcoRossi, organizationId: world.agenziaTre, role: "OPERATOR" },
        { userId: world.boVerifier, organizationId: world.astax, role: "BO_VERIFIER" },
      ],
    });
    await tx.teamInvite.createMany({
      data: [world.agenziaUno, world.agenziaDue].map((organizationId, i) => ({
        organizationId,
        emailHash: `hash-${tag}-${i}`,
        role: "OPERATOR" as const,
        tokenHash: `token-${tag}-${i}`,
        invitedByUserId: i === 0 ? world.ownerUno : world.ownerDue,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      })),
    });
    return world;
  });
}

export const asMember = (userId: string, organizationId: string, isStaff = false): DbContext => ({
  kind: "USER",
  userId,
  organizationId,
  isStaff,
});

export const asPrivate = (userId: string): DbContext => ({
  kind: "USER",
  userId,
  organizationId: null,
  isStaff: false,
});

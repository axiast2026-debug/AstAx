import { LocalFieldCipher } from "@astax/adapters/crypto";
import { findRepoRoot } from "@astax/shared/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_CONTEXT, withContext, type DbClient } from "../src/index.js";
import { LEGAL_PLACEHOLDER_MARK } from "../src/seed/legal-placeholders.js";
import { seedReference } from "../src/seed/reference.js";
import { SYNTHETIC, seedSynthetic, syntheticId } from "../src/seed/synthetic.js";
import { appDb, asMember, asPrivate, superDb } from "./fixtures.js";

const SEED = "seed-test";
const cipher = new LocalFieldCipher("1".repeat(64), "2".repeat(64));
const repoRoot = findRepoRoot(import.meta.dirname);
let db: DbClient;

const runSeed = () =>
  withContext(
    db,
    SYSTEM_CONTEXT,
    async (tx) => ({
      reference: await seedReference(tx, repoRoot),
      synthetic: await seedSynthetic(tx, cipher, SEED),
    }),
    { timeoutMs: 120_000 },
  );

beforeAll(async () => {
  db = appDb();
  await runSeed();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("fase 1 passo 4: seed", () => {
  it("loads parameters, lists, holidays and legal placeholders", async () => {
    const counts = await withContext(db, SYSTEM_CONTEXT, async (tx) => ({
      fee: await tx.setting.findFirstOrThrow({ where: { key: "fees.private.amountCents" } }),
      vehicleTypes: await tx.listValue.findMany({
        where: { listKey: "vehicleType" },
        orderBy: { sortOrder: "asc" },
      }),
      christmas2027: await tx.holiday.findUnique({
        where: { date: new Date("2027-12-25T00:00:00.000Z") },
      }),
      easterMonday2026: await tx.holiday.findUnique({
        where: { date: new Date("2026-04-06T00:00:00.000Z") },
      }),
      legal: await tx.legalDocumentVersion.findMany(),
    }));
    expect(counts.fee.value).toBe(3000);
    expect(counts.vehicleTypes.map((v) => [v.code, v.active])).toEqual([
      ["CAR", true],
      ["MOTORCYCLE", true],
      ["MOPED", true],
      ["LIGHT_TRUCK_OWN_USE", false],
      ["CAMPER", false],
    ]);
    expect(counts.christmas2027?.name).toBe("Natale");
    expect(counts.easterMonday2026?.name).toBe("Lunedì dell'Angelo");
    expect(counts.legal.length).toBe(10);
    // LEG-03: every placeholder is marked and not validated.
    expect(
      counts.legal.every(
        (v) => v.contentMd.startsWith(LEGAL_PLACEHOLDER_MARK) && v.status === "DRAFT",
      ),
    ).toBe(true);
  });

  it("creates the organizations and users of the scenarios, with Marco Rossi in Uno and Tre", async () => {
    const marco = syntheticId(SEED, "user", "marco-rossi");
    const memberships = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.membership.findMany({ where: { userId: marco }, include: { organization: true } }),
    );
    expect(memberships.map((m) => m.organization.legalName).sort()).toEqual([
      "Agenzia Tre",
      "Agenzia Uno",
    ]);
    expect(SYNTHETIC.users.filter((u) => u.kind === "PRIVATE").map((u) => u.firstName)).toEqual([
      "Giulia",
      "Sara",
      "Davide",
      "Elena",
      "Luca",
    ]);
  });

  it("phase 3: invented companies, the mandates of «Dati comuni» and the filters of S04", async () => {
    const uno = syntheticId(SEED, "org", "agenzia-uno");
    const due = syntheticId(SEED, "org", "agenzia-due");
    const { mandates, filters } = await withContext(db, SYSTEM_CONTEXT, async (tx) => ({
      mandates: await tx.agencyMandate.findMany({
        where: { organizationId: uno },
        include: { company: true },
      }),
      filters: await tx.agencyFilter.findMany({ where: { organizationId: { in: [uno, due] } } }),
    }));
    expect(mandates.map((m) => m.company.name).sort()).toEqual([
      "Compagnia Alfa",
      "Compagnia Beta",
    ]);
    const types = (id: string) =>
      (filters.find((f) => f.organizationId === id)?.criteria as { vehicleTypes: string[] })
        .vehicleTypes;
    expect(types(uno)).toContain("MOTORCYCLE");
    expect(types(due)).toEqual(["CAR"]);
  });

  it("is idempotent: running it again changes nothing", async () => {
    const count = () =>
      withContext(db, SYSTEM_CONTEXT, async (tx) => [
        await tx.setting.count(),
        await tx.listValue.count(),
        await tx.organization.count(),
        await tx.user.count(),
        await tx.membership.count(),
      ]);
    const before = await count();
    await runSeed();
    expect(await count()).toEqual(before);
  });

  it("SIC-03 stores contacts only encrypted, findable by blind index", async () => {
    const giulia = SYNTHETIC.users.find((u) => u.key === "private-giulia-neri");
    if (!giulia) throw new Error("missing Giulia Neri");
    const found = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.user.findUniqueOrThrow({ where: { emailHash: cipher.blindIndex("email", giulia.email) } }),
    );
    expect(found.firstName).toBe("Giulia");
    expect(cipher.decrypt(found.emailEnc ?? "")).toBe(giulia.email);

    const su = superDb();
    try {
      const dump = await su.$queryRawUnsafe<{ row: string }[]>(
        `SELECT row_to_json(u)::text AS row FROM "User" u`,
      );
      const text = dump.map((r) => r.row).join("\n");
      expect(text).not.toContain(giulia.email);
      expect(text).not.toContain(giulia.phone.replace(/\s/g, ""));
    } finally {
      await su.$disconnect();
    }
  });

  it("the synthetic agencies respect row level security like any other", async () => {
    const owner = syntheticId(SEED, "user", "agenzia-uno-owner");
    const orgs = await withContext(
      db,
      asMember(owner, syntheticId(SEED, "org", "agenzia-uno")),
      (tx) => tx.organization.findMany(),
    );
    expect(orgs.map((o) => o.legalName)).toEqual(["Agenzia Uno"]);
  });
});

describe("fase 2: reference data for requests", () => {
  it("loads the ISTAT municipalities, the excluded cases and the coverage packages", async () => {
    const data = await withContext(db, SYSTEM_CONTEXT, async (tx) => ({
      municipalities: await tx.municipality.count(),
      milan: await tx.municipality.findUnique({ where: { cadastralCode: "F205" } }),
      rules: await tx.exclusionRule.findMany({ orderBy: { code: "asc" } }),
      packages: await tx.coveragePackageVersion.findMany({ orderBy: { packageCode: "asc" } }),
    }));
    expect(data.municipalities).toBeGreaterThan(7800);
    expect(data.milan).toMatchObject({ istatCode: "015146", province: "MI", name: "Milano" });
    expect(data.rules.find((r) => r.code === "TAXI")).toMatchObject({
      blockingInWizard: true,
      active: true,
    });
    expect(data.rules.find((r) => r.code === "VINTAGE")).toMatchObject({ blockingInWizard: false });
    expect(data.packages.map((p) => [p.packageCode, p.version])).toEqual([
      ["BASE", 1],
      ["COMPLETE", 1],
      // Dan, 2026-10-21: the two packages of the private customer.
      ["CUSTOM", 1],
      ["PLUS", 1],
      ["RECOMMENDED", 1],
    ]);
  });

  it("the seed can run again without duplicating rows", async () => {
    await runSeed();
    const count = await withContext(db, SYSTEM_CONTEXT, (tx) => tx.coveragePackageVersion.count());
    expect(count).toBe(5);
  });

  it("an ordinary user can read but not change reference data", async () => {
    await expect(
      withContext(db, asPrivate("00000000-0000-7000-8000-000000000001"), (tx) =>
        tx.municipality.update({ where: { istatCode: "015146" }, data: { name: "X" } }),
      ),
    ).rejects.toThrow();
    const milan = await withContext(db, asPrivate("00000000-0000-7000-8000-000000000001"), (tx) =>
      tx.municipality.findUnique({ where: { istatCode: "015146" } }),
    );
    expect(milan?.name).toBe("Milano");
  });
});

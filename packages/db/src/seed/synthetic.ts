import type { FieldCipher } from "@astax/adapters/crypto";
import {
  AgencyFilterCriteriaSchema,
  buildVatNumber,
  type AgencyFilterCriteria,
} from "@astax/shared/domain";
import type { DbTransaction } from "../client.js";
import type { Locale, MembershipRole, OrganizationType, UserKind } from "../generated/prisma/client.js";
import { deterministicUuid } from "./deterministic-id.js";

/**
 * Synthetic organizations and users of docs/scenari-accettazione.md, «Dati comuni»
 * (SIC-08, CLAUDE.md rule 11). Same seed, same data: ids are derived from it.
 */
export const DEFAULT_SYNTHETIC_SEED = "astax-dev-1";

export interface SyntheticUser {
  key: string;
  kind: UserKind;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  locale: Locale;
}

export interface SyntheticOrganization {
  key: string;
  type: OrganizationType;
  legalName: string;
  ruiNumber: string | null;
  ruiSection: "A" | "B" | null;
  serial: number;
}

export interface SyntheticMembership {
  user: string;
  organization: string;
  role: MembershipRole;
  ruiNumberE?: string;
  canIssue?: boolean;
  canSeeColleagueOffers?: boolean;
  canSeeAccounting?: boolean;
  seesAllClients?: boolean;
}

/** Invented companies of «Dati comuni» (rule 11). */
export const COMPANY_NAMES = ["Alfa", "Beta", "Gamma", "Delta"] as const;

/**
 * Mandates of the agencies: Uno-Cinque as in «Dati comuni», Sei-Dieci for the
 * tests on invitations.
 */
export const AGENCY_MANDATES: Record<string, readonly (typeof COMPANY_NAMES)[number][]> = {
  uno: ["Alfa", "Beta"],
  due: ["Alfa"],
  tre: ["Beta", "Gamma"],
  quattro: ["Gamma"],
  cinque: ["Beta", "Delta"],
  sei: ["Alfa"],
  sette: ["Beta"],
  otto: ["Gamma"],
  nove: ["Delta"],
  dieci: ["Alfa", "Delta"],
};

/** S04: only these agencies take motorcycles and mopeds; the others cars only. */
export const TWO_WHEELER_AGENCIES = ["uno", "tre", "quattro", "nove"] as const;

/** Reception hours of the synthetic agencies: the working hours of ASTA-02. */
const RECEPTION_HOURS = {
  mon: [["09:00", "19:00"]],
  tue: [["09:00", "19:00"]],
  wed: [["09:00", "19:00"]],
  thu: [["09:00", "19:00"]],
  fri: [["09:00", "19:00"]],
  sat: [["09:00", "13:00"]],
  sun: [],
};

const AGENCY_NAMES = ["Uno", "Due", "Tre", "Quattro", "Cinque", "Sei", "Sette", "Otto", "Nove", "Dieci"];
const OWNER_NAMES: [string, string][] = [
  ["Anna", "Moretti"],
  ["Bruno", "Costa"],
  ["Carla", "Fontana"],
  ["Dario", "Greco"],
  ["Emma", "Lombardi"],
  ["Franco", "Barbieri"],
  ["Gaia", "Rinaldi"],
  ["Ivo", "Caruso"],
  ["Lia", "Ferrara"],
  ["Nino", "Gallo"],
];
const SUPERVISOR_NAMES: [string, string][] = [
  ["Olga", "Martini"],
  ["Piero", "Leone"],
  ["Rita", "Longo"],
  ["Sergio", "Gentile"],
  ["Tina", "Marino"],
  ["Ugo", "Villa"],
  ["Vera", "Conte"],
  ["Walter", "Sartori"],
  ["Zoe", "Bellini"],
  ["Aldo", "Testa"],
];
const OPERATOR_NAMES: [string, string][] = [
  ["Bianca", "Ferri"],
  ["Cesare", "Pellegrini"],
  ["Delia", "Palumbo"],
  ["Enzo", "Sanna"],
  ["Flavia", "Farina"],
  ["Gino", "Rizzo"],
  ["Irene", "Monti"],
  ["Lino", "Cattaneo"],
  ["Marta", "Morelli"],
  ["Nico", "Amato"],
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
let phoneCounter = 0;
const nextPhone = () => {
  phoneCounter += 1;
  return `+39 333 000 ${String(phoneCounter).padStart(4, "0")}`;
};

function user(
  key: string,
  kind: UserKind,
  firstName: string,
  lastName: string,
  domain: string,
  locale: Locale = "it",
): SyntheticUser {
  return {
    key,
    kind,
    firstName,
    lastName,
    email: `${slug(firstName)}.${slug(lastName)}@${domain}`,
    phone: nextPhone(),
    locale,
  };
}

function buildDataset() {
  phoneCounter = 0;
  const organizations: SyntheticOrganization[] = [
    { key: "astax", type: "ASTAX", legalName: "AstAx (dati di prova)", ruiNumber: null, ruiSection: null, serial: 1 },
    {
      key: "broker-demo",
      type: "BROKER",
      legalName: "Broker Demo Srl",
      ruiNumber: "B000000001",
      ruiSection: "B",
      serial: 2,
    },
    ...AGENCY_NAMES.map((name, i) => ({
      key: `agenzia-${slug(name)}`,
      type: "AGENCY" as const,
      legalName: `Agenzia ${name}`,
      ruiNumber: `A${String(i + 1).padStart(9, "0")}`,
      ruiSection: "A" as const,
      serial: 10 + i,
    })),
  ];

  const users: SyntheticUser[] = [
    user("bo-verifier", "STAFF", "Arta", "Hoxha", "astax.test", "sq"),
    user("bo-support", "STAFF", "Chiara", "Lodi", "astax.test"),
    user("bo-accounting", "STAFF", "Fabio", "Serra", "astax.test"),
    user("bo-supervisor", "STAFF", "Ilaria", "Volpe", "astax.test"),
    user("admin", "STAFF", "Paola", "Ricci", "astax.test"),
    user("broker-owner", "PROFESSIONAL", "Laura", "Bianchi", "broker-demo.test"),
    user("broker-operator", "PROFESSIONAL", "Paolo", "Verdi", "broker-demo.test"),
    user("marco-rossi", "PROFESSIONAL", "Marco", "Rossi", "collaboratori.test"),
  ];
  const memberships: SyntheticMembership[] = [
    { user: "bo-verifier", organization: "astax", role: "BO_VERIFIER" },
    { user: "bo-support", organization: "astax", role: "BO_SUPPORT" },
    { user: "bo-accounting", organization: "astax", role: "BO_ACCOUNTING" },
    { user: "bo-supervisor", organization: "astax", role: "BO_SUPERVISOR" },
    { user: "admin", organization: "astax", role: "ADMIN" },
    { user: "broker-owner", organization: "broker-demo", role: "OWNER" },
    { user: "broker-operator", organization: "broker-demo", role: "OPERATOR", ruiNumberE: "E000000001" },
  ];

  AGENCY_NAMES.forEach((name, i) => {
    const org = `agenzia-${slug(name)}`;
    const domain = `${org}.test`;
    const [ownerFirst, ownerLast] = OWNER_NAMES[i] ?? ["Titolare", name];
    const [supFirst, supLast] = SUPERVISOR_NAMES[i] ?? ["Supervisore", name];
    const [opFirst, opLast] = OPERATOR_NAMES[i] ?? ["Operatore", name];
    users.push(
      user(`${org}-owner`, "PROFESSIONAL", ownerFirst, ownerLast, domain),
      user(`${org}-supervisor`, "PROFESSIONAL", supFirst, supLast, domain),
      user(`${org}-operator`, "PROFESSIONAL", opFirst, opLast, domain),
    );
    memberships.push(
      { user: `${org}-owner`, organization: org, role: "OWNER" },
      { user: `${org}-supervisor`, organization: org, role: "SUPERVISOR", canSeeAccounting: true },
      {
        user: `${org}-operator`,
        organization: org,
        role: "OPERATOR",
        ruiNumberE: `E${String(100 + i).padStart(9, "0")}`,
        canIssue: true,
      },
    );
  });

  // Marco Rossi: operator in Agenzia Uno and Agenzia Tre (scenarios, OFF-02).
  memberships.push(
    { user: "marco-rossi", organization: "agenzia-uno", role: "OPERATOR", ruiNumberE: "E000000099" },
    { user: "marco-rossi", organization: "agenzia-tre", role: "OPERATOR", ruiNumberE: "E000000099" },
  );
  // Sofia Marchi: Marco's colleague in Agenzia Tre (S10).
  users.push(user("sofia-marchi", "PROFESSIONAL", "Sofia", "Marchi", "agenzia-tre.test"));
  memberships.push({
    user: "sofia-marchi",
    organization: "agenzia-tre",
    role: "OPERATOR",
    ruiNumberE: "E000000098",
  });

  for (const [first, last] of [
    ["Giulia", "Neri"],
    ["Sara", "Conti"],
    ["Davide", "Galli"],
    ["Elena", "Sala"],
    ["Luca", "Ferri"],
  ] as const) {
    users.push(user(`private-${slug(first)}-${slug(last)}`, "PRIVATE", first, last, "example.test"));
  }

  return { organizations, users, memberships };
}

export const SYNTHETIC = buildDataset();

export const syntheticId = (
  seed: string,
  kind: "org" | "user" | "membership" | "company",
  key: string,
) =>
  deterministicUuid(seed, `${kind}:${key}`);

export interface SyntheticCounts {
  organizations: number;
  users: number;
  memberships: number;
}

export async function seedSynthetic(
  tx: DbTransaction,
  cipher: FieldCipher,
  seed: string = DEFAULT_SYNTHETIC_SEED,
): Promise<SyntheticCounts> {
  for (const org of SYNTHETIC.organizations) {
    const vatNumber = buildVatNumber(9_000_000 + org.serial, 15);
    await tx.organization.upsert({
      where: { id: syntheticId(seed, "org", org.key) },
      create: {
        id: syntheticId(seed, "org", org.key),
        type: org.type,
        legalName: org.legalName,
        vatNumber,
        fiscalCodeEnc: cipher.encrypt(vatNumber),
        fiscalCodeHash: cipher.blindIndex("vatNumber", vatNumber),
        ruiNumber: org.ruiNumber,
        ruiSection: org.ruiSection,
        pec: `${slug(org.legalName)}@pec.example.test`,
        status: "ACTIVE",
      },
      update: {},
    });
  }

  for (const u of SYNTHETIC.users) {
    const id = syntheticId(seed, "user", u.key);
    await tx.user.upsert({
      where: { id },
      create: {
        id,
        kind: u.kind,
        firstName: u.firstName,
        lastName: u.lastName,
        emailEnc: cipher.encrypt(u.email),
        emailHash: cipher.blindIndex("email", u.email),
        phoneEnc: cipher.encrypt(u.phone),
        phoneHash: cipher.blindIndex("phone", u.phone),
        locale: u.locale,
        personId: deterministicUuid(seed, `person:${u.key}`),
      },
      update: {},
    });
  }

  for (const m of SYNTHETIC.memberships) {
    const id = syntheticId(seed, "membership", `${m.user}@${m.organization}`);
    await tx.membership.upsert({
      where: { id },
      create: {
        id,
        userId: syntheticId(seed, "user", m.user),
        organizationId: syntheticId(seed, "org", m.organization),
        role: m.role,
        ruiNumberE: m.ruiNumberE ?? null,
        canIssue: m.canIssue ?? false,
        canSeeColleagueOffers: m.canSeeColleagueOffers ?? false,
        canSeeAccounting: m.canSeeAccounting ?? false,
        seesAllClients: m.seesAllClients ?? false,
      },
      update: {},
    });
  }

  await seedAgencies(tx, seed);

  return {
    organizations: SYNTHETIC.organizations.length,
    users: SYNTHETIC.users.length,
    memberships: SYNTHETIC.memberships.length,
  };
}

/**
 * Companies, mandates, one product per mandate, filters and capacity of the
 * synthetic agencies (ASTA-05). Rerunning the seed leaves later changes alone.
 */
async function seedAgencies(tx: DbTransaction, seed: string): Promise<void> {
  // Companies are found by name: one list for every seed in the same database.
  const companyId = new Map<string, string>();
  for (const name of COMPANY_NAMES) {
    const company = await tx.insuranceCompany.upsert({
      where: { name: `Compagnia ${name}` },
      create: {
        id: syntheticId(seed, "company", name.toLowerCase()),
        name: `Compagnia ${name}`,
      },
      update: {},
    });
    companyId.set(name, company.id);
  }
  for (const [agency, companies] of Object.entries(AGENCY_MANDATES)) {
    const organizationId = syntheticId(seed, "org", `agenzia-${agency}`);
    const companyIds = companies.map((c) => companyId.get(c) ?? "");
    for (const [i, companyId] of companyIds.entries()) {
      await tx.agencyMandate.upsert({
        where: { organizationId_companyId: { organizationId, companyId } },
        create: {
          organizationId,
          companyId,
          source: "MANUAL",
          verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        update: {},
      });
      await tx.insuranceProduct.upsert({
        where: {
          organizationId_companyId_name_version: {
            organizationId,
            companyId,
            name: `RC Auto ${companies[i] ?? ""}`,
            version: 1,
          },
        },
        create: { organizationId, companyId, name: `RC Auto ${companies[i] ?? ""}` },
        update: {},
      });
    }
    const twoWheels = (TWO_WHEELER_AGENCIES as readonly string[]).includes(agency);
    const criteria: AgencyFilterCriteria = {
      vehicleTypes: twoWheels ? ["CAR", "MOTORCYCLE", "MOPED"] : ["CAR"],
      provinces: null,
      cuClassMin: 1,
      cuClassMax: 18,
      maxClaimsLast5y: null,
      driverAgeMin: 18,
      driverAgeMax: 99,
      packages: ["BASE", "PLUS", "COMPLETE"],
      companies: companyIds as [string, ...string[]],
      maxStartDateDays: 60,
      maxGuaranteeDays: 30,
    };
    await tx.agencyFilter.upsert({
      where: { organizationId },
      create: { organizationId, criteria: AgencyFilterCriteriaSchema.parse(criteria) },
      update: {},
    });
    await tx.agencyCapacity.upsert({
      where: { organizationId },
      create: { organizationId, dailyMax: null, receptionHours: RECEPTION_HOURS },
      update: {},
    });
  }
}

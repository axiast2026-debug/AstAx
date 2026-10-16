import { randomUUID } from "node:crypto";
import { generateAuctionKeyPair, KMS_KEYS, LocalKms, wipe } from "@astax/adapters/kms";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptAllLegal,
  membershipId,
  orgId,
  startHarness,
  type Harness,
  type UserKey,
} from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 3: offers during the auction through the API (docs/busta-chiusa.md,
// scenario S07). The private account is Elena Sala, used by no other file.
// The auction is opened here as the worker would (its activities have their
// own tests in apps/worker).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const ELENA_EMAIL = "elena.sala@example.test";
let elena: Who;
let requestId: string;
let auctionId: string;
let companies: Record<string, string>;
let products: Record<string, string>;

const who = async (key: UserKey, org?: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  ...(org ? { context: membershipId(key, org) } : {}),
});

const COVERAGE = {
  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
  recourseWaiver: { included: false },
  roadsideAssistance: { included: false },
  legalProtection: { included: false },
  driverAccident: { included: false },
  theftFire: { included: false },
  naturalEventsVandalism: { included: false },
  glass: { included: false },
};

const offerFor = (agency: string, company: string, more: Record<string, unknown> = {}) => ({
  annualGrossPremiumCents: 50500,
  companyId: companies[company],
  productId: products[`${agency}:${company}`],
  coverage: COVERAGE,
  guaranteeUntil: "2026-12-10",
  notes: null,
  binding: true,
  ...more,
});

const PDF = new TextEncoder().encode("%PDF-1.7 preventivo di prova");

function sendOffer(
  agent: Who,
  path: string,
  offer: unknown,
  pdf: Uint8Array | null = PDF,
  method = "POST",
) {
  return fetch(`${h.baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${agent.token}`,
      ...(agent.context ? { "x-astax-context": agent.context } : {}),
      "x-offer": Buffer.from(JSON.stringify(offer)).toString("base64url"),
      ...(pdf ? { "content-type": "application/pdf" } : {}),
    },
    ...(pdf ? { body: pdf } : {}),
  });
}

const audit = (action: string, targetId?: string) =>
  withContext(h.db, SYSTEM_CONTEXT, (tx) =>
    tx.auditLog.findMany({ where: { action, ...(targetId ? { targetId } : {}) } }),
  );

/** The auction as the worker opens it: key pair, wrapped private key, invitations. */
async function openAuction(id: string, agencies: string[]) {
  const kms = new LocalKms({ [KMS_KEYS.sealedBids]: "5".repeat(64) });
  const auction = randomUUID();
  const keys = await generateAuctionKeyPair();
  const wrapped = await kms.encrypt(KMS_KEYS.sealedBids, keys.privateKey, {
    purpose: "sealed-bid",
    auctionId: auction,
  });
  await wipe(keys.privateKey);
  const now = h.clock.now();
  await withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
    const request = await tx.quoteRequest.update({
      where: { id },
      data: { status: "AUCTION_OPEN" },
    });
    await tx.auction.create({
      data: {
        id: auction,
        quoteRequestId: id,
        ownerUserId: request.ownerUserId,
        ownerOrganizationId: request.ownerOrganizationId,
        kind: "MAIN",
        round: 1,
        openedAt: now,
        scheduledCloseAt: new Date(now.getTime() + 2 * 3_600_000),
        originalCloseAt: new Date(now.getTime() + 2 * 3_600_000),
        minGuaranteeDate: new Date("2026-12-01"),
        durationHours: 2,
        settingsSnapshot: {
          "calendar.workingHours": {
            mon: [["09:00", "19:00"]],
            tue: [["09:00", "19:00"]],
            wed: [["09:00", "19:00"]],
            thu: [["09:00", "19:00"]],
            fri: [["09:00", "19:00"]],
            sat: [["09:00", "13:00"]],
            sun: [],
          },
          "auction.closingReminderMinutes": 60,
          "invitations.topUp.checkAtFraction": 0.5,
          "invitations.topUp.minOffers": 3,
          "invitations.topUp.extra": 4,
          "invitations.backOfficeWindowFraction": 0.5,
          "invitations.max": 8,
          "invitations.minReceptionOverlapWorkingHours": 1,
        },
        publicKey: keys.publicKey,
        wrappedPrivateKey: wrapped,
        kmsKeyRef: KMS_KEYS.sealedBids,
      },
    });
    await tx.invitation.createMany({
      data: agencies.map((a) => ({
        auctionId: auction,
        organizationId: orgId(a),
        source: "AUTO" as const,
        invitedAt: now,
      })),
    });
  });
  return auction;
}

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "private-elena-sala",
    "bo-verifier",
    "bo-support",
    "bo-accounting",
    "bo-supervisor",
    "admin",
    "broker-operator",
    "agenzia-uno-owner",
    "agenzia-uno-operator",
    "agenzia-due-owner",
    "agenzia-tre-owner",
    "agenzia-cinque-owner",
    "agenzia-sei-owner",
    "marco-rossi",
  ] as const) {
    await acceptAllLegal(h, key);
  }
  elena = await who("private-elena-sala");
  // Monday 16/11/2026, 9:00 in Rome (the harness clock).
  const request = await r.submittedPrivateRequest(elena, ELENA_EMAIL);
  requestId = request.id;
  const verifier = await who("bo-verifier", "astax");
  await r.json(
    await r.call(verifier, `/verification/requests/${requestId}/approve`, { body: {} }),
    200,
  );
  auctionId = await openAuction(requestId, [
    "agenzia-uno",
    "agenzia-due",
    "agenzia-tre",
    "agenzia-cinque",
    "agenzia-sei",
  ]);
  const rows = await withContext(h.db, SYSTEM_CONTEXT, async (tx) => ({
    companies: await tx.insuranceCompany.findMany(),
    products: await tx.insuranceProduct.findMany({ include: { company: true } }),
  }));
  companies = Object.fromEntries(
    rows.companies.map((c) => [c.name.replace("Compagnia ", ""), c.id]),
  );
  products = Object.fromEntries(
    rows.products.map((p) => {
      const agency = Object.entries({
        uno: "agenzia-uno",
        due: "agenzia-due",
        tre: "agenzia-tre",
        cinque: "agenzia-cinque",
        sei: "agenzia-sei",
      }).find(([, key]) => orgId(key) === p.organizationId)?.[1];
      return [`${agency ?? p.organizationId}:${p.company.name.replace("Compagnia ", "")}`, p.id];
    }),
  );
});

afterAll(async () => {
  await h.close();
});

describe("fase 3: claims and offers (OFF-01..07, BC-02, BC-04, BC-05)", () => {
  let offerId: string;

  it("OFF-02 one person works on an auction for one agency only: Marco claims for Tre, not also for Uno", async () => {
    const marcoTre = await who("marco-rossi", "agenzia-tre");
    const marcoUno = await who("marco-rossi", "agenzia-uno");
    await r.json(await r.call(marcoTre, `/auctions/${auctionId}/claim`, { body: {} }), 200);
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(marcoUno, `/auctions/${auctionId}/claim`, { body: {} }),
      409,
    );
    expect(refused.errors).toContainEqual({ path: "claim", issue: "ONE_PERSON_ONE_AGENCY" });
    await r.json(await r.call(marcoTre, `/auctions/${auctionId}/release`, { body: {} }), 200);
  });

  it("OFF-04 OFF-05 VIS-11 the content is checked before sealing", async () => {
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    const issues = async (offer: unknown, pdf: Uint8Array | null = PDF) =>
      (
        await r.json<{ errors: { path: string; issue: string }[] }>(
          await sendOffer(uno, `/auctions/${auctionId}/offers`, offer, pdf),
          400,
        )
      ).errors;
    expect(
      await issues(offerFor("agenzia-uno", "Alfa", { guaranteeUntil: "2026-11-30" })),
    ).toContainEqual({
      path: "guaranteeUntil",
      issue: "GUARANTEE_BEFORE_MINIMUM",
    });
    expect(
      await issues(offerFor("agenzia-uno", "Alfa", { notes: "chiamami al 333 1234567" })),
    ).toContainEqual({
      path: "notes",
      issue: "NOTES_PHONE",
    });
    expect(
      await issues(offerFor("agenzia-uno", "Alfa", { companyId: companies.Gamma })),
    ).toContainEqual({
      path: "companyId",
      issue: "COMPANY_NOT_MANDATED",
    });
    expect(await issues(offerFor("agenzia-uno", "Alfa"), null)).toContainEqual({
      path: "pdf",
      issue: "PDF_REQUIRED",
    });
    expect(
      (
        await sendOffer(
          uno,
          `/auctions/${auctionId}/offers`,
          offerFor("agenzia-uno", "Alfa", { binding: false }),
        )
      ).status,
    ).toBe(400);
  });

  it("BC-02 S07 three offers are sealed at their arrival: no premium or notes in any table, no company in the offer tables, no PDF in clear in the storage", async () => {
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    const created = await r.json<{ id: string; version: number }>(
      await sendOffer(
        uno,
        `/auctions/${auctionId}/offers`,
        offerFor("agenzia-uno", "Alfa", { notes: "Sconto fedeltà" }),
      ),
      201,
    );
    offerId = created.id;
    expect(created.version).toBe(1);
    for (const [key, agency, company, cents] of [
      ["agenzia-cinque-owner", "agenzia-cinque", "Beta", 51700],
      ["agenzia-sei-owner", "agenzia-sei", "Alfa", 52900],
    ] as const) {
      await r.json(
        await sendOffer(
          await who(key, agency),
          `/auctions/${auctionId}/offers`,
          offerFor(agency, company, {
            annualGrossPremiumCents: cents,
            notes: "Rata mensile possibile",
          }),
        ),
        201,
      );
    }
    // A copy of the whole database, table by table.
    const dump = await withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
      const tables = await tx.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
      const all: Record<string, string> = {};
      for (const { table_name } of tables) {
        const rows = await tx.$queryRawUnsafe<{ row: unknown }[]>(
          `SELECT row_to_json(t)::text AS row FROM "${table_name}" t`,
        );
        all[table_name] = rows.map((r) => String(r.row)).join(String.fromCharCode(10));
      }
      return all;
    });
    const everything = Object.values(dump).join(String.fromCharCode(10));
    // A premium as a value of its own: not the same digits inside a hash or an id.
    for (const cents of ["50500", "51700", "52900"]) {
      expect(everything, cents).not.toMatch(new RegExp(`(?<![0-9a-fA-F])${cents}(?![0-9a-fA-F])`));
    }
    for (const plain of ["505,00", "Sconto fedeltà", "Rata mensile possibile"]) {
      expect(everything, plain).not.toContain(plain);
    }
    for (const table of ["Offer", "OfferVersion"]) {
      for (const company of [
        companies.Alfa ?? "x",
        companies.Beta ?? "x",
        "Compagnia Alfa",
        "Compagnia Beta",
      ]) {
        expect(dump[table] ?? "", `${table} ${company}`).not.toContain(company);
      }
    }
    // The PDFs are stored encrypted.
    const stored = [...h.storage.objects.values()].map((o) => new TextDecoder().decode(o.body));
    expect(stored.some((body) => body.includes("preventivo di prova"))).toBe(false);
  });

  it("BC-04 the agency reads its own offer, and the reading is logged", async () => {
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    const own = await r.json<{
      offer: { annualGrossPremiumCents: number; notes: string };
      hasPdf: boolean;
    }>(await r.call(uno, `/offers/${offerId}`), 200);
    expect(own.offer.annualGrossPremiumCents).toBe(50500);
    expect(own.offer.notes).toBe("Sconto fedeltà");
    expect(own.hasPdf).toBe(true);
    const pdf = await r.call(uno, `/offers/${offerId}/pdf`);
    expect(new TextDecoder().decode(await pdf.arrayBuffer())).toBe("%PDF-1.7 preventivo di prova");
    expect(await audit("OFFER_OWNER_COPY_READ", offerId)).toHaveLength(2);
  });

  it("S07 BC-01 every other role gets 403 on the offer, its PDF and the list of the round, and the log has SEALED_BID_ACCESS_DENIED", async () => {
    const before = (await audit("SEALED_BID_ACCESS_DENIED")).length;
    const others: Who[] = [
      await who("admin", "astax"),
      await who("bo-verifier", "astax"),
      await who("bo-support", "astax"),
      await who("bo-accounting", "astax"),
      await who("bo-supervisor", "astax"),
      elena,
      await who("broker-operator", "broker-demo"),
      await who("agenzia-due-owner", "agenzia-due"),
      // Same agency, an operator without canSeeColleagueOffers.
      await who("agenzia-uno-operator", "agenzia-uno"),
    ];
    for (const other of others) {
      for (const path of [`/offers/${offerId}`, `/offers/${offerId}/pdf`]) {
        const response = await r.call(other, path);
        expect(response.status, path).toBe(403);
        expect(((await response.json()) as { code: string }).code).toBe("SEALED_BID");
      }
    }
    // The list of the round: 403 for who is not an agency; an agency sees only its own.
    for (const other of others.slice(0, 7)) {
      expect((await r.call(other, `/auctions/${auctionId}/offers`)).status).toBe(403);
    }
    expect(
      await r.json(await r.call(others[7] as Who, `/auctions/${auctionId}/offers`), 200),
    ).toEqual([]);
    const denied = await audit("SEALED_BID_ACCESS_DENIED");
    expect(denied.length - before).toBe(9 * 2 + 7);
    expect(denied.at(-1)).toMatchObject({ targetType: "Auction", targetId: auctionId });
  });

  it("OFF-03 the claim locks the request for the colleagues of the same agency", async () => {
    const operator = await who("agenzia-uno-operator", "agenzia-uno");
    const refused = await r.json<{ code: string }>(
      await sendOffer(operator, `/offers/${offerId}`, offerFor("agenzia-uno", "Alfa"), PDF, "PUT"),
      409,
    );
    expect(refused.code).toBe("CLAIMED_BY_COLLEAGUE");
  });

  it("OFF-01 one offer per agency in the round", async () => {
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    expect(
      (await sendOffer(uno, `/auctions/${auctionId}/offers`, offerFor("agenzia-uno", "Beta")))
        .status,
    ).toBe(409);
  });

  it("OFF-07 a change until the closing makes a new version; the previous stays sealed", async () => {
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    const changed = await r.json<{ version: number }>(
      await sendOffer(
        uno,
        `/offers/${offerId}`,
        offerFor("agenzia-uno", "Beta", { annualGrossPremiumCents: 49900 }),
        null,
        "PUT",
      ),
      200,
    );
    expect(changed.version).toBe(2);
    const versions = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.offerVersion.findMany({ where: { offerId } }),
    );
    expect(versions.map((v) => v.version)).toEqual([1]);
    const own = await r.json<{ offer: { annualGrossPremiumCents: number }; hasPdf: boolean }>(
      await r.call(uno, `/offers/${offerId}`),
      200,
    );
    expect(own.offer.annualGrossPremiumCents).toBe(49900);
    expect(own.hasPdf).toBe(true);
  });

  it("VIS-03 the requester sees the countdown and the number of offers, no price", async () => {
    const status = await r.json<{ auction: Record<string, unknown> }>(
      await r.call(elena, `/requests/${requestId}/auction`),
      200,
    );
    expect(status.auction).toMatchObject({ status: "OPEN", offers: 3 });
    expect(status.auction).not.toHaveProperty("invitedAgencies");
    expect(JSON.stringify(status)).not.toContain("499");
  });

  it("OFF-08 an invited agency declines, with a reason from the list", async () => {
    const due = await who("agenzia-due-owner", "agenzia-due");
    await r.json(
      await r.call(due, `/auctions/${auctionId}/decline`, {
        body: { reasonCode: "OUT_OF_TARIFF" },
      }),
      200,
    );
    const invitation = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.invitation.findFirstOrThrow({
        where: { auctionId, organizationId: orgId("agenzia-due") },
      }),
    );
    expect(invitation).toMatchObject({ status: "DECLINED", declineReason: "OUT_OF_TARIFF" });
  });

  it("ASTA-06 the back office extends or cancels with a reason; invitations only in the first half (then 409)", async () => {
    const verifier = await who("bo-verifier", "astax");
    // Rule 7: at most the longest duration in force (24 working hours), at most invitations.max agencies.
    const tooLong = await r.json<{ errors: { path: string; issue: string }[] }>(
      await r.call(verifier, `/auctions/${auctionId}/extend`, {
        body: { workingHours: 1000, reason: "Troppo lungo" },
      }),
      400,
    );
    expect(tooLong.errors).toContainEqual({ path: "workingHours", issue: "TOO_LONG" });
    const nine = Array.from({ length: 9 }, () => orgId("agenzia-quattro"));
    expect(
      (
        await r.call(verifier, `/auctions/${auctionId}/invite`, {
          body: { organizationIds: nine, reason: "Troppe" },
        })
      ).status,
    ).toBe(400);
    await r.json(
      await r.call(verifier, `/auctions/${auctionId}/extend`, {
        body: { workingHours: 1, reason: "Guasto tecnico" },
      }),
      202,
    );
    // The workflow gets ids only; the reason stays in the audit log (BC-07).
    expect(h.signals.sent.at(-1)).toMatchObject({
      requestId,
      name: "auctionExtended",
      input: { auctionId, workingHours: 1 },
    });
    expect(JSON.stringify(h.signals.sent)).not.toContain("Guasto");
    const [requested] = await audit("AUCTION_EXTENSION_REQUESTED", auctionId);
    expect(requested?.reason).toBe("Guasto tecnico");
    await r.json(
      await r.call(verifier, `/auctions/${auctionId}/invite`, {
        body: { organizationIds: [orgId("agenzia-quattro")], reason: "Più compagnie" },
      }),
      202,
    );
    h.clock.advanceMinutes(61);
    const verifierLater = await who("bo-verifier", "astax");
    const late = await r.json<{ errors: { issue: string }[] }>(
      await r.call(verifierLater, `/auctions/${auctionId}/invite`, {
        body: { organizationIds: [orgId("agenzia-cinque")], reason: "Tardi" },
      }),
      409,
    );
    expect(late.errors).toContainEqual({ path: "auction", issue: "AFTER_FIRST_HALF" });
    expect(
      (
        await r.call(await who("broker-operator", "broker-demo"), `/auctions/${auctionId}/cancel`, {
          body: { reason: "x".repeat(5) },
        })
      ).status,
    ).toBe(403);
    const list = await r.json<{
      auctions: { auctionId: string; offers: number | null; invited: number }[];
    }>(await r.call(verifierLater, "/auctions"), 200);
    const row = list.auctions.find((a) => a.auctionId === auctionId);
    expect(row).toMatchObject({ offers: 3, invited: 5 });
    expect(JSON.stringify(row)).not.toContain("499");
  });

  it("BC-05 a submission that waits for the closing's lock is refused once the auction is closed", async () => {
    const tre = await who("agenzia-tre-owner", "agenzia-tre");
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // The closing activity: lock, CLOSING, ... CLOSED.
    const closing = h.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.is_system', 'true', true)`;
        await tx.$queryRaw`SELECT 1 FROM "Auction" WHERE "id" = ${auctionId}::uuid FOR UPDATE`;
        await tx.auction.update({ where: { id: auctionId }, data: { status: "CLOSING" } });
        locked();
        await held;
        await tx.auction.update({
          where: { id: auctionId },
          data: { status: "CLOSED", closedAt: h.clock.now() },
        });
      },
      { timeout: 20_000 },
    );
    await isLocked;
    const submission = sendOffer(
      tre,
      `/auctions/${auctionId}/offers`,
      offerFor("agenzia-tre", "Gamma"),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await closing;
    const response = await submission;
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("AUCTION_CLOSED");
    expect(
      await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
        tx.offer.count({ where: { auctionId, organizationId: orgId("agenzia-tre") } }),
      ),
    ).toBe(0);
  });

  it("BC-05 OFF-07 after the closing no change and no withdrawal", async () => {
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    expect((await r.call(uno, `/offers/${offerId}/withdraw`, { body: {} })).status).toBe(409);
  });
});

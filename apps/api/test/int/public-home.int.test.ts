import { settingsAt, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closedRound, openTestAuction } from "./auction-helpers.js";
import { acceptAllLegal, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Momento 1, ADR 0016: the public home, without access, anonymous or aggregate only.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let codes: string[] = [];

const setParameter = (key: string, value: unknown) =>
  withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
    const count = await tx.setting.count({ where: { key } });
    await tx.setting.create({
      data: {
        key,
        value: value as never,
        version: count + 1,
        validFrom: new Date(h.clock.now().getTime() - 1000),
        reason: "test",
      },
    });
  });

/** The home is kept for a minute: each reading starts after it. */
const readHome = async () => {
  h.clock.set(new Date(h.clock.now().getTime() + 61_000));
  const response = await h.call("/public/home");
  expect(response.status).toBe(200);
  return (await response.json()) as {
    fees: Record<string, number>;
    service: Record<string, number>;
    live: null | {
      openAuctions: number;
      offersPerAuction: number;
      featured: null | Record<string, unknown>;
      ticker: { kind: string; count: number; province: string | null }[];
      saving: null | { percent: number; policies: number };
    };
  };
};

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of ["agenzia-uno-owner", "agenzia-tre-owner"] as const)
    await acceptAllLegal(h, key);
  const customer: Who = {
    token: await h.token({
      sub: "kc-private-public-home",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email: "privato.home@example.test",
      givenName: "Privato",
      familyName: "Home",
    }),
  };
  const pending = (await (await h.call("/legal/pending", customer)).json()) as {
    versionId: string;
  }[];
  await h.call("/legal/acceptances", {
    ...customer,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
  const closed = await r.submittedPrivateRequest(customer, "privato.home@example.test");
  const open = await r.submittedPrivateRequest(customer, "privato.home@example.test");
  codes = [closed.code, open.code];
  const now = h.clock.now().toISOString();
  await closedRound(h, closed.id, [
    {
      agency: "agenzia-uno",
      company: "Compagnia Alfa",
      cents: 52_000,
      until: "2026-12-05",
      at: now,
    },
    {
      agency: "agenzia-tre",
      company: "Compagnia Gamma",
      cents: 61_000,
      until: "2026-12-10",
      at: now,
    },
  ]);
  await openTestAuction(h, open.id, ["agenzia-uno"]);
});

afterAll(async () => {
  await h.close();
});

describe("Momento 1: the public home (ADR 0016)", () => {
  it("FEE-01 FEE-02 without access: the fees from the parameters; no live data while switched off", async () => {
    const home = await readHome();
    // The values in force now: other files of the suite may change them in the shared database.
    const s = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      settingsAt(
        tx,
        [
          "fees.private.amountCents",
          "fees.private.aiSupplementCents",
          "fees.private.lowPremium.thresholdCents",
          "fees.private.lowPremium.amountCents",
          "invitations.max",
          "auction.defaultDurationWorkingHours",
          "fees.agency.amountCents",
          "issuance.deadlineWorkingHours",
        ],
        h.clock.now(),
      ),
    );
    expect(home.fees).toEqual({
      privateCents: s["fees.private.amountCents"],
      aiSupplementCents: s["fees.private.aiSupplementCents"],
      lowPremiumThresholdCents: s["fees.private.lowPremium.thresholdCents"],
      lowPremiumCents: s["fees.private.lowPremium.amountCents"],
    });
    expect(home.service).toEqual({
      maxInvitedAgencies: s["invitations.max"],
      defaultDurationWorkingHours: s["auction.defaultDurationWorkingHours"],
      agencyFeeCents: s["fees.agency.amountCents"],
      issuanceWorkingHours: s["issuance.deadlineWorkingHours"],
    });
    expect(home.live).toBeNull();
  });

  it("ADR 0016 switched on but under the threshold of closed auctions: still no live data", async () => {
    await setParameter("home.publicData.enabled", true);
    await setParameter("home.publicData.minClosedAuctions", 1000);
    expect((await readHome()).live).toBeNull();
  });

  it("ADR 0016 VIS-03 over the threshold: open auctions, one running now, the latest events and the averages, never a price, plate or code", async () => {
    await setParameter("home.publicData.minClosedAuctions", 1);
    const home = await readHome();
    const live = home.live;
    expect(live).not.toBeNull();
    expect(live?.openAuctions).toBeGreaterThanOrEqual(1);
    expect(live?.offersPerAuction).toBeGreaterThan(0);
    // The round closing first, maybe of another file in the shared database: only its shape.
    expect(live?.featured).toMatchObject({ envelopes: expect.any(Number) });
    expect(live?.featured).toHaveProperty("workingSecondsLeft");
    expect(live?.ticker.some((e) => e.kind === "CLOSED" && e.count === 2)).toBe(true);
    expect(live?.ticker.some((e) => e.kind === "ENVELOPE")).toBe(true);
    const text = JSON.stringify(home);
    for (const code of codes) expect(text).not.toContain(code);
    expect(text).not.toMatch(/52000|61000|Compagnia|Agenzia|GN123AB|@example/);
  });
});

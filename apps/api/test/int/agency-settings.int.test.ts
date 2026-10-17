import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptAllLegal,
  membershipId,
  startHarness,
  type Harness,
  type UserKey,
} from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 4: the agency's own settings (spec 04 «Filtri e capacità», «Agenzia», «Team»).
// Agenzia Dieci is used for the changes, which are undone at the end.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const ORG = "agenzia-dieci";

interface Criteria {
  vehicleTypes: string[];
  provinces: string[] | null;
  cuClassMin: number;
  cuClassMax: number;
  maxClaimsLast5y: number | null;
  driverAgeMin: number;
  driverAgeMax: number;
  packages: string[];
  companies: string[];
  maxStartDateDays: number;
  maxGuaranteeDays: number;
}
interface FiltersPage {
  agency: Criteria | null;
  mine: Criteria | null;
  capacity: { distribution: string; receptionHours: unknown } | null;
  choices: { companies: { id: string; name: string }[] };
}

const who = async (key: UserKey, org = ORG): Promise<Who> => ({
  token: await h.tokenFor(key),
  context: membershipId(key, org),
});
let original: Criteria;

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "agenzia-dieci-owner",
    "agenzia-dieci-supervisor",
    "agenzia-dieci-operator",
    "agenzia-uno-owner",
  ] as const) {
    await acceptAllLegal(h, key);
  }
  const page = await r.json<FiltersPage>(
    await r.call(await who("agenzia-dieci-owner"), "/agency/filters"),
    200,
  );
  original = page.agency as Criteria;
});

afterAll(async () => {
  const owner = await who("agenzia-dieci-owner");
  await r.call(owner, "/agency/filters/mine", { method: "PUT", body: { criteria: null } });
  await r.call(await who("agenzia-dieci-operator"), "/agency/filters/mine", {
    method: "PUT",
    body: { criteria: null },
  });
  await r.call(owner, "/agency/filters", { method: "PUT", body: original });
  await h.close();
});

describe("fase 4: filters, capacity, products, access log (spec 04)", () => {
  it("ASTA-05 the supervisor changes the agency's filters; the operator may not (403)", async () => {
    const narrower = { ...original, provinces: ["MI", "RM"] };
    await r.json(
      await r.call(await who("agenzia-dieci-supervisor"), "/agency/filters", {
        method: "PUT",
        body: narrower,
      }),
      200,
    );
    const page = await r.json<FiltersPage>(
      await r.call(await who("agenzia-dieci-operator"), "/agency/filters"),
      200,
    );
    expect(page.agency?.provinces).toEqual(["MI", "RM"]);
    const refused = await r.call(await who("agenzia-dieci-operator"), "/agency/filters", {
      method: "PUT",
      body: original,
    });
    expect(refused.status).toBe(403);
  });

  it("ASTA-05 the agency's filters accept only companies with a verified mandate", async () => {
    const other = await r.json<FiltersPage>(
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/agency/filters"),
      200,
    );
    const foreign = other.choices.companies.find((c) => !original.companies.includes(c.id))?.id;
    expect(foreign).toBeDefined();
    const response = await r.call(await who("agenzia-dieci-owner"), "/agency/filters", {
      method: "PUT",
      body: { ...original, companies: [foreign] },
    });
    const problem = await r.json<{ errors: { issue: string }[] }>(response, 400);
    expect(problem.errors.map((e) => e.issue)).toContain("COMPANY_NOT_MANDATED");
  });

  it("VIS-06 personal filters may narrow the agency's, never widen them", async () => {
    const operator = await who("agenzia-dieci-operator");
    const wider = await r.call(operator, "/agency/filters/mine", {
      method: "PUT",
      body: { criteria: { ...original, provinces: ["MI", "RM", "NA"], cuClassMax: 18 } },
    });
    const problem = await r.json<{ errors: { path: string; issue: string }[] }>(wider, 400);
    expect(problem.errors).toContainEqual({ path: "mine.PROVINCES", issue: "WIDER_THAN_AGENCY" });
    await r.json(
      await r.call(operator, "/agency/filters/mine", {
        method: "PUT",
        body: { criteria: { ...original, provinces: ["MI"] } },
      }),
      200,
    );
    const page = await r.json<FiltersPage>(await r.call(operator, "/agency/filters"), 200);
    expect(page.mine?.provinces).toEqual(["MI"]);
  });

  it("ASTA-05 capacity: daily maximum, reception hours, pause and distribution, logged", async () => {
    const owner = await who("agenzia-dieci-owner");
    const hours = {
      mon: [["09:00", "18:00"]],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    };
    await r.json(
      await r.call(owner, "/agency/capacity", {
        method: "PUT",
        body: { dailyMax: 5, receptionHours: hours, pausedUntil: null, distribution: "ALL_USERS" },
      }),
      200,
    );
    const bad = await r.call(owner, "/agency/capacity", {
      method: "PUT",
      body: {
        dailyMax: 5,
        receptionHours: { mon: [["18:00", "09:00"]] },
        pausedUntil: null,
        distribution: "ALL_USERS",
      },
    });
    expect(bad.status).toBe(400);
    const logged = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.count({ where: { action: "AGENCY_CAPACITY_CHANGED" } }),
    );
    expect(logged).toBeGreaterThan(0);
  });

  it("decision 17: the product library, only for mandated companies, with its PDF information set", async () => {
    const owner = await who("agenzia-dieci-owner");
    const library = await r.json<{ companies: { id: string }[] }>(
      await r.call(owner, "/agency/products"),
      200,
    );
    const companyId = library.companies[0]?.id ?? "";
    const created = await r.json<{ id: string }>(
      await r.call(owner, "/agency/products", { body: { companyId, name: "RC Auto Prova" } }),
      201,
    );
    const operator = await who("agenzia-dieci-operator");
    expect(
      (await r.call(operator, "/agency/products", { body: { companyId, name: "Altro" } })).status,
    ).toBe(403);
    const upload = (body: Uint8Array, type: string) =>
      fetch(`${h.baseUrl}/agency/products/${created.id}/documents?kind=PRODUCT_DIP`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${owner.token}`,
          "x-astax-context": owner.context ?? "",
          "content-type": type,
        },
        body,
      });
    expect((await upload(new TextEncoder().encode("not a pdf"), "image/png")).status).toBe(400);
    await r.json(await upload(new TextEncoder().encode("%PDF-1.4 dip"), "application/pdf"), 201);
    const after = await r.json<{
      products: { id: string; documents: Record<string, { id: string } | null> }[];
    }>(await r.call(operator, "/agency/products"), 200);
    const product = after.products.find((p) => p.id === created.id);
    const dip = product?.documents.PRODUCT_DIP;
    expect(dip).toBeTruthy();
    expect(product?.documents.PRODUCT_CONDITIONS).toBeNull();
    const file = await r.call(operator, `/agency/products/${created.id}/documents/${dip?.id}`);
    expect(file.status).toBe(200);
    // Another agency cannot read it.
    const uno = await who("agenzia-uno-owner", "agenzia-uno");
    expect((await r.call(uno, `/agency/products/${created.id}/documents/${dip?.id}`)).status).toBe(
      404,
    );
  });

  it("VIS-08 the owner sees the agency's accesses; the supervisor may not (403); reading is logged", async () => {
    const owner = await who("agenzia-dieci-owner");
    // An operator tries a request the agency is not invited to: refused and logged.
    const operator = await who("agenzia-dieci-operator");
    const notInvited = "01900000-0000-7000-8000-000000000001";
    expect((await r.call(operator, `/agency/requests/${notInvited}`)).status).toBe(404);
    const log = await r.json<{ entries: { action: string; user: string | null }[] }>(
      await r.call(owner, "/agency/access-log"),
      200,
    );
    expect(log.entries[0]).toMatchObject({ action: "ACCESS_DENIED" });
    expect(log.entries[0]?.user).toBeTruthy();
    // VIS-08: another agency's owner never sees these entries.
    const dieciNames = (
      await r.json<{ members: { firstName: string; lastName: string }[] }>(
        await r.call(owner, "/team"),
        200,
      )
    ).members.map((m) => `${m.firstName} ${m.lastName}`);
    const uno = await r.json<{ entries: { user: string | null }[] }>(
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/agency/access-log"),
      200,
    );
    expect(uno.entries.filter((e) => e.user && dieciNames.includes(e.user))).toEqual([]);
    expect((await r.call(await who("agenzia-dieci-supervisor"), "/agency/access-log")).status).toBe(
      403,
    );
    const read = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.count({ where: { action: "AUDIT_LOG_READ", targetType: "Organization" } }),
    );
    expect(read).toBeGreaterThan(0);
  });

  it("spec 04 «Team»: each member with RUI number and last access", async () => {
    const team = await r.json<{
      members: { ruiNumberE: string | null; lastLoginAt: string | null; role: string }[];
    }>(await r.call(await who("agenzia-dieci-owner"), "/team"), 200);
    const operator = team.members.find((m) => m.role === "OPERATOR");
    expect(operator?.ruiNumberE).toMatch(/^E\d{9}$/);
    expect(team.members.every((m) => "lastLoginAt" in m)).toBe(true);
  });
});

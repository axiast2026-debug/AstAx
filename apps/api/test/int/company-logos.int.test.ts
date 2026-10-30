import { randomUUID } from "node:crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkLogo } from "../../src/settings/companies.controller.js";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";

// ADR 0028: the logos of the companies, public to read, set by the back office.
let h: Harness;
let companyId: string;
let admin: { token: string; context: string };

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
);

const upload = (who: { token: string; context: string }, body: Uint8Array, type: string) =>
  fetch(`${h.baseUrl}/admin/companies/${companyId}/logo`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${who.token}`,
      "x-astax-context": who.context,
      "content-type": type,
    },
    body,
  });

beforeAll(async () => {
  h = await startHarness();
  await acceptAllLegal(h, "admin");
  admin = { token: await h.tokenFor("admin"), context: membershipId("admin", "astax") };
  companyId = await withContext(h.db, SYSTEM_CONTEXT, async (tx) => {
    const c = await tx.insuranceCompany.create({
      data: { name: `Compagnia Logo ${randomUUID().slice(0, 8)}` },
    });
    return c.id;
  });
});

afterAll(async () => {
  await h.close();
});

describe("ADR 0028: company logos", () => {
  it("a company without a logo answers 404, so the apps show the placeholder", async () => {
    expect((await h.call(`/companies/${companyId}/logo`)).status).toBe(404);
  });

  it("the administrator uploads a logo, anyone reads it, the change is in the audit log", async () => {
    expect((await upload(admin, SVG, "image/svg+xml")).status).toBe(200);
    const read = await h.call(`/companies/${companyId}/logo`);
    expect(read.status).toBe(200);
    expect(read.headers.get("content-type")).toContain("image/svg+xml");
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(SVG);

    expect((await upload(admin, PNG, "image/png")).status).toBe(200);
    const replaced = await h.call(`/companies/${companyId}/logo`);
    expect(replaced.headers.get("content-type")).toContain("image/png");

    const logged = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findMany({
        where: { action: "COMPANY_LOGO_SET", targetId: companyId },
        orderBy: { seq: "asc" },
      }),
    );
    expect(logged.map((l) => l.after)).toEqual([
      { logoKey: `public/companies/${companyId}.svg` },
      { logoKey: `public/companies/${companyId}.png` },
    ]);
  });

  it("refuses an SVG with a script and a file that is not PNG or SVG", async () => {
    const script = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect((await upload(admin, script, "image/svg+xml")).status).toBe(400);
    expect((await upload(admin, new Uint8Array([1, 2, 3]), "image/png")).status).toBe(400);
    expect(checkLogo(SVG, "image/svg+xml")).toBe("svg");
    expect(checkLogo(PNG, "image/jpeg")).toBeNull();
  });

  it("only the administrator sets a logo (rule 3)", async () => {
    await acceptAllLegal(h, "bo-verifier");
    const verifier = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    expect((await upload(verifier, SVG, "image/svg+xml")).status).toBe(403);
    expect((await h.call("/admin/companies", verifier)).status).toBe(403);
    const list = (await (await h.call("/admin/companies", admin)).json()) as {
      companyId: string;
      hasLogo: boolean;
    }[];
    expect(list.find((c) => c.companyId === companyId)?.hasLogo).toBe(true);
  });
});

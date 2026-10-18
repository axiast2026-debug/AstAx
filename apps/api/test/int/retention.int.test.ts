import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildFiscalCode, BULK_CSV_HEADER } from "@astax/shared/domain";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, LEG-06 and proposal G: a request not concluded, untouched for
// retention.incompleteRequestsMonths (12), loses documents and personal data
// (clock moved forward); code, dates and the audit log stay.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "broker-owner");
});

afterAll(async () => {
  await h.close();
});

describe("phase 7 retention (LEG-06)", () => {
  it("deletes a draft of 13 months ago with its documents and the broker's customer data", async () => {
    const broker: Who = {
      token: await h.tokenFor("broker-owner"),
      context: membershipId("broker-owner", "broker-demo"),
    };
    const cf = buildFiscalCode({
      surname: "Vecchi",
      givenName: "Dario",
      birthDate: "1970-01-20",
      sex: "M",
      birthPlaceCadastralCode: "L219",
    });
    const zip = zipSync({
      "clienti.csv": strToU8(
        [
          BULK_CSV_HEADER,
          `persona;Vecchi;Dario;;${cf};;dario.vecchi@example.test;;FK111AB;libretto.jpg;;`,
        ].join("\n"),
      ),
      "libretto.jpg": JPEG,
    });
    const upload = await fetch(`${h.baseUrl}/broker/bulk-uploads`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${broker.token}`,
        "x-astax-context": broker.context ?? "",
        "content-type": "application/zip",
      },
      body: zip,
    });
    const done = await r.json<{ results: { requestId: string; code: string }[] }>(upload, 201);
    const draftId = done.results[0]?.requestId ?? "";
    const document = await system((tx) =>
      tx.document.findFirstOrThrow({ where: { quoteRequestId: draftId } }),
    );
    expect(await h.storage.get(document.storageKey)).toBeDefined();

    // A request cancelled after the signature and the payment (a full refund
    // before issuance): a contract, kept for the legal terms (LEG-06).
    const paid = await system(async (tx) => {
      const q = await tx.quoteRequest.create({
        data: {
          code: `AX-RET-${draftId.slice(0, 8)}`,
          channel: "BROKER",
          status: "CANCELLED",
          requesterUserId: (await tx.quoteRequest.findUniqueOrThrow({ where: { id: draftId } }))
            .requesterUserId,
          ownerOrganizationId: (await tx.quoteRequest.findUniqueOrThrow({ where: { id: draftId } }))
            .ownerOrganizationId,
        },
      });
      await tx.acceptance.create({
        data: {
          quoteRequestId: q.id,
          offerId: draftId,
          ownerOrganizationId: q.ownerOrganizationId,
          acceptedByUserId: q.requesterUserId,
          premiumCents: 40_000,
          feeCents: 3000,
          feeRule: "BROKER",
          aiUsed: false,
          status: "PAID",
          paidAt: h.clock.now(),
        },
      });
      return q;
    });

    // 11 months later: not yet.
    const start = h.clock.now().getTime();
    h.clock.set(new Date(start + 335 * 86_400_000));
    await acceptAllLegal(h, "admin");
    let admin: Who = { token: await h.tokenFor("admin"), context: membershipId("admin", "astax") };
    const early = await r.json<{ candidates: { code: string }[] }>(
      await r.call(admin, "/admin/retention"),
      200,
    );
    expect(early.candidates.map((c) => c.code)).not.toContain(done.results[0]?.code);

    // 13 months later.
    h.clock.set(new Date(start + 396 * 86_400_000));
    admin = { token: await h.tokenFor("admin"), context: membershipId("admin", "astax") };
    const preview = await r.json<{ months: number; candidates: { code: string }[] }>(
      await r.call(admin, "/admin/retention"),
      200,
    );
    expect(preview.months).toBe(12);
    expect(preview.candidates.map((c) => c.code)).toContain(done.results[0]?.code);

    const run = await r.json<{ requests: number; documents: number; customers: number }>(
      await r.call(admin, "/admin/retention/run", { body: {} }),
      200,
    );
    expect(run.requests).toBeGreaterThanOrEqual(1);
    expect(run.documents).toBeGreaterThanOrEqual(1);

    const request = await system((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: draftId } }),
    );
    expect(request).toMatchObject({ draftEnc: null, plate: null, code: done.results[0]?.code });
    expect(request.purgedAt).not.toBeNull();
    const after = await system((tx) =>
      tx.document.findUniqueOrThrow({ where: { id: document.id } }),
    );
    expect(after.deletedAt).not.toBeNull();
    await expect(h.storage.get(document.storageKey)).rejects.toThrow();
    const customer = await system((tx) =>
      tx.customer.findUniqueOrThrow({
        where: { id: request.customerId ?? "" },
        include: { person: true },
      }),
    );
    expect(customer).toMatchObject({ emailEnc: null, phoneEnc: null });
    expect(customer.person).toMatchObject({ surname: null, givenName: null, fiscalCodeEnc: null });
    const logged = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "RETENTION_PURGED", targetId: draftId } }),
    );
    expect(logged?.before).toMatchObject({ code: done.results[0]?.code, status: "DRAFT" });

    // The paid one is still whole.
    const kept = await system((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: paid.id } }),
    );
    expect(kept.purgedAt).toBeNull();

    // A second run finds nothing more of it.
    const again = await r.json<{ candidates: { code: string }[] }>(
      await r.call(admin, "/admin/retention"),
      200,
    );
    expect(again.candidates.map((c) => c.code)).not.toContain(done.results[0]?.code);
  });
});

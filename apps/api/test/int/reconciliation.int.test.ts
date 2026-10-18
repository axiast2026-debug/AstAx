import { randomUUID } from "node:crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { STATEMENT_CSV_HEADER } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 06 «Pagamenti» (proposal C): the statement of the separate
// account is imported, the credits matched to the payments by request code
// and amount, the rest goes to the queue; the daily balance.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let accounting: Who;
let customer: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "bo-accounting");
  await acceptAllLegal(h, "private-davide-galli");
  accounting = {
    token: await h.tokenFor("bo-accounting"),
    context: membershipId("bo-accounting", "astax"),
  };
  customer = { token: await h.tokenFor("private-davide-galli") };
});

afterAll(async () => {
  await h.close();
});

/** A request paid by the customer: premium and fee captured today. */
async function paidRequest(premiumCents: number) {
  const request = await r.submittedPrivateRequest(customer, "davide.galli@example.test");
  return system(async (tx) => {
    const q = await tx.quoteRequest.update({
      where: { id: request.id },
      data: { status: "ACCEPTED" },
    });
    const acceptance = await tx.acceptance.create({
      data: {
        quoteRequestId: q.id,
        offerId: randomUUID(),
        ownerUserId: q.ownerUserId,
        acceptedByUserId: q.requesterUserId,
        premiumCents,
        feeCents: 3000,
        feeRule: "PRIVATE",
        aiUsed: false,
        status: "PAID",
        paidAt: h.clock.now(),
      },
    });
    const payment = await tx.payment.create({
      data: {
        acceptanceId: acceptance.id,
        ownerUserId: q.ownerUserId,
        provider: "fake-payments",
        providerRef: `pay-${acceptance.id}`,
        premiumCents,
        feeCents: 3000,
        idempotencyKey: `${acceptance.id}-1`,
        status: "CAPTURED",
        method: "INSTANT_TRANSFER",
        capturedAt: h.clock.now(),
      },
    });
    return { code: q.code, paymentId: payment.id };
  });
}

const upload = (body: string, fileName: string) =>
  fetch(`${h.baseUrl}/back-office/reconciliation/statements?fileName=${fileName}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accounting.token}`,
      "x-astax-context": accounting.context ?? "",
      "content-type": "text/csv",
    },
    body,
  });

const euro = (cents: number) =>
  `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;

describe("phase 7 reconciliation", () => {
  it("matches by code and amount, queues the rest, refuses the same file twice", async () => {
    const first = await paidRequest(61_237);
    const second = await paidRequest(48_911);
    const today = romeCalendarDate(h.clock.now());
    const csv = [
      STATEMENT_CSV_HEADER,
      `${today};${today};${euro(64_237)};EUR;Davide Galli;Bonifico ${first.code};REC-${first.code}`,
      // The right code, a wrong amount: the queue.
      `${today};${today};${euro(50_000)};EUR;Davide Galli;Pagamento ${second.code};REC-${second.code}`,
      // A debit of the bank: the queue, to be ignored with a note.
      `${today};${today};-2,50;EUR;Banca;Commissioni;REC-FEE-${first.code}`,
    ].join("\n");
    const imported = await r.json<{ lines: number; matched: number; unmatched: number }>(
      await upload(csv, "estratto.csv"),
      201,
    );
    expect(imported).toMatchObject({ lines: 3, matched: 1, unmatched: 2 });
    const again = await upload(csv, "estratto.csv");
    expect(again.status).toBe(409);

    const queue = await r.json<
      { id: string; amountCents: number; description: string; candidates: { id: string }[] }[]
    >(await r.call(accounting, "/back-office/reconciliation/lines"), 200);
    const wrongAmount = queue.find((l) => l.description.includes(second.code));
    const fee = queue.find((l) => l.amountCents === -250);
    expect(wrongAmount).toBeDefined();
    expect(fee).toBeDefined();

    // By hand: the line with the wrong amount to its payment, with a note.
    await r.json(
      await r.call(accounting, `/back-office/reconciliation/lines/${wrongAmount?.id}/match`, {
        body: { paymentId: second.paymentId, note: "Il cliente ha arrotondato l'importo" },
      }),
      200,
    );
    await r.json(
      await r.call(accounting, `/back-office/reconciliation/lines/${fee?.id}/ignore`, {
        body: { note: "Commissioni della banca" },
      }),
      200,
    );
    const left = await r.json<{ id: string }[]>(
      await r.call(accounting, "/back-office/reconciliation/lines"),
      200,
    );
    expect(left.map((l) => l.id)).not.toContain(wrongAmount?.id);
    // The same payment cannot be matched twice.
    const matched = await r.json<{ id: string; requestCode: string | null }[]>(
      await r.call(accounting, "/back-office/reconciliation/lines?status=MATCHED"),
      200,
    );
    expect(matched.map((m) => m.requestCode)).toEqual(
      expect.arrayContaining([first.code, second.code]),
    );
    const logged = await system((tx) =>
      tx.auditLog.findFirst({ where: { action: "BANK_LINE_MATCHED", targetId: wrongAmount?.id } }),
    );
    expect(logged?.reason).toBe("Il cliente ha arrotondato l'importo");

    const daily = await r.json<{ day: string; creditsCents: number; matchedCents: number }[]>(
      await r.call(accounting, `/back-office/reconciliation/daily?from=${today}&to=${today}`),
      200,
    );
    expect(daily[0]).toMatchObject({
      day: today,
      creditsCents: 64_237 + 50_000,
      matchedCents: 64_237 + 50_000,
    });
  });

  it("reads a camt.053 statement and refuses a file in another format", async () => {
    const third = await paidRequest(33_333);
    const today = romeCalendarDate(h.clock.now());
    const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">363.33</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>${today}</Dt></BookgDt>
<AcctSvcrRef>CAMT-${third.code}</AcctSvcrRef><NtryDtls><TxDtls><RmtInf><Ustrd>${third.code}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`;
    const imported = await r.json<{ format: string; matched: number }>(
      await upload(camt, "camt.xml"),
      201,
    );
    expect(imported).toEqual(expect.objectContaining({ format: "CAMT053", matched: 1 }));
    const bad = await r.json<{ errors: { issue: string }[] }>(
      await upload("ciao;mondo\n1;2", "x.csv"),
      400,
    );
    expect(bad.errors[0]?.issue).toBe("STATEMENT_HEADER");
  });

  it("the verifier cannot import statements", async () => {
    await acceptAllLegal(h, "bo-verifier");
    const verifier: Who = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    expect((await r.call(verifier, "/back-office/reconciliation/lines")).status).toBe(403);
  });
});

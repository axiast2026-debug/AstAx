import { describe, expect, it } from "vitest";
import {
  amountToCents,
  dailyBalance,
  matchStatement,
  parseCamt053,
  parseStatement,
  parseStatementCsv,
  requestCodesIn,
  STATEMENT_CSV_HEADER,
  StatementFormatError,
} from "./reconciliation.js";

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>STMT-1</MsgId><CreDtTm>2026-10-20T07:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>1</Id>
      <Ntry>
        <Amt Ccy="EUR">535.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-10-19</Dt></BookgDt>
        <ValDt><Dt>2026-10-19</Dt></ValDt>
        <AcctSvcrRef>BANK-0001</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Nm>Rossi &amp; figli</Nm></Dbtr></RltdPties>
          <RmtInf><Ustrd>Polizza AX-2026-000123</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">12.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-10-19</Dt></BookgDt>
        <AcctSvcrRef>BANK-0002</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe("reconciliation (proposal C, phase 7)", () => {
  it("rule 5 reads amounts in the Italian and the dotted format as integer cents", () => {
    expect(amountToCents("535,00")).toBe(53_500);
    expect(amountToCents("1.234,56")).toBe(123_456);
    expect(amountToCents("-12,5")).toBe(-1_250);
    expect(amountToCents("535.00")).toBe(53_500);
    expect(amountToCents("1,234.56")).toBe(123_456);
    expect(amountToCents("abc")).toBeNull();
  });

  it("reads the bank CSV and refuses another header or a broken row", () => {
    const lines = parseStatementCsv(
      `${STATEMENT_CSV_HEADER}\n2026-10-19;2026-10-19;535,00;EUR;"Rossi; Mario";Pagamento AX-2026-000123;B1\n`,
    );
    expect(lines).toEqual([
      {
        bookingDate: "2026-10-19",
        valueDate: "2026-10-19",
        amountCents: 53_500,
        currency: "EUR",
        counterparty: "Rossi; Mario",
        description: "Pagamento AX-2026-000123",
        reference: "B1",
      },
    ]);
    expect(() => parseStatementCsv("a;b\n1;2")).toThrow(StatementFormatError);
    expect(() => parseStatementCsv(`${STATEMENT_CSV_HEADER}\n19/10/2026;;535;EUR;;x;`)).toThrow(
      /ROW_2/,
    );
  });

  it("reads a camt.053: credits positive, debits negative, the remittance text", () => {
    const lines = parseCamt053(CAMT);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      amountCents: 53_500,
      counterparty: "Rossi & figli",
      description: "Polizza AX-2026-000123",
      reference: "BANK-0001",
    });
    expect(lines[1]?.amountCents).toBe(-1_250);
    expect(parseStatement(CAMT).format).toBe("CAMT053");
    expect(() => parseCamt053("<Document><Other/></Document>")).toThrow(/NOT_CAMT053/);
  });

  it("finds the request codes however the payer wrote them", () => {
    expect(requestCodesIn("rif ax 2026 000123 e AX-2026-000124", "AX")).toEqual([
      "AX-2026-000123",
      "AX-2026-000124",
    ]);
  });

  it("proposal C matches on the request code and the same amount, only when one payment fits", () => {
    const payments = [
      { id: "p1", requestCode: "AX-2026-000123", amountCents: 53_500 },
      { id: "p2", requestCode: "AX-2026-000124", amountCents: 40_000 },
      { id: "p3", requestCode: "AX-2026-000125", amountCents: 30_000 },
      { id: "p4", requestCode: "AX-2026-000125", amountCents: 30_000 },
    ];
    const matches = matchStatement(
      [
        { id: "l1", amountCents: 53_500, description: "AX-2026-000123" },
        // Same code, different amount: to the queue.
        { id: "l2", amountCents: 39_000, description: "AX-2026-000124" },
        // Two payments fit: to the queue, a person decides.
        { id: "l3", amountCents: 30_000, description: "AX-2026-000125" },
        // A debit is never matched.
        { id: "l4", amountCents: -53_500, description: "AX-2026-000123" },
        // The same payment twice: only the first line.
        { id: "l5", amountCents: 53_500, description: "AX-2026-000123" },
      ],
      payments,
      "AX",
    );
    expect(matches).toEqual([{ lineId: "l1", paymentId: "p1" }]);
  });

  it("the daily balance compares the credits of the day with the captured payments", () => {
    expect(
      dailyBalance(
        [
          { bookingDate: "2026-10-19", amountCents: 53_500, matched: true },
          { bookingDate: "2026-10-19", amountCents: 10_000, matched: false },
          { bookingDate: "2026-10-19", amountCents: -1_250, matched: false },
        ],
        [
          { day: "2026-10-19", amountCents: 53_500 },
          { day: "2026-10-20", amountCents: 7_000 },
        ],
      ),
    ).toEqual([
      {
        day: "2026-10-19",
        creditsCents: 63_500,
        matchedCents: 53_500,
        capturedCents: 53_500,
        differenceCents: 10_000,
      },
      {
        day: "2026-10-20",
        creditsCents: 0,
        matchedCents: 0,
        capturedCents: 7_000,
        differenceCents: -7_000,
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { ManualClock } from "../clock/manual-clock.js";
import {
  FAKE_REJECTED_VAT,
  FakeEInvoicing,
  InvalidInvoiceXmlError,
} from "../e-invoicing/e-invoicing.js";
import { buildFatturaPa, type FatturaPaInput } from "./fatturapa.js";
import { buildPain001 } from "./pain001.js";
import { validateXml, xmlAmount } from "./validate.js";

const ASTAX = {
  vatNumber: "12345678901",
  name: "AstAx Srl",
  address: { street: "Via degli Esempi 1", postalCode: "20121", city: "Milano", province: "MI" },
};

const privateInvoice = (over: Partial<FatturaPaInput> = {}): FatturaPaInput => ({
  progressive: "P0000001",
  documentType: "TD01",
  number: "P-2026-000001",
  date: "2026-11-16",
  supplier: ASTAX,
  customer: {
    fiscalCode: "NREGLI85A41H501X",
    name: "Giulia Neri",
    givenName: "Giulia",
    surname: "Neri",
    address: { street: "Via Inventata 3", postalCode: "00184", city: "Roma", province: "RM" },
  },
  recipientCode: "0000000",
  lines: [
    { description: "Compenso di intermediazione AX-2026-000001", quantity: 1, unitCents: 3500 },
  ],
  vatNature: "N4",
  legalReference: "Operazione esente IVA ai sensi dell'art. 10, comma 1, n. 9, DPR 633/1972",
  stampDutyCents: 0,
  stampDutyCharged: false,
  totalCents: 3500,
  ...over,
});

describe("CONT-02 the SEPA file of the remittances", () => {
  it("CONT-02 pain.001.001.03 passes the official ISO 20022 schema", async () => {
    const xml = buildPain001({
      messageId: "AX-REM-2026-11-30",
      createdAt: new Date("2026-11-30T07:00:00Z"),
      executionDate: "2026-11-30",
      debtor: { name: "AstAx Srl conto separato", iban: "IT60 X054 2811 1010 0000 0123 456" },
      transfers: [
        {
          endToEndId: "01a14a00-0000-7000-8000-000000000001",
          amountCents: 50500,
          creditorName: "Agenzia Uno Srl",
          creditorIban: "IT02A0301503200000003517230",
          remittanceInfo: "Rimessa AstAx 30/11/2026",
        },
        {
          endToEndId: "01a14a00-0000-7000-8000-000000000002",
          amountCents: 12345,
          creditorName: "Agenzia Città Due",
          creditorIban: "IT28W8000000292100645211151",
          remittanceInfo: "Rimessa AstAx 30/11/2026",
        },
      ],
    });
    const check = await validateXml("PAIN_001", xml);
    expect(check.errors).toEqual([]);
    expect(check.valid).toBe(true);
    expect(xml).toContain("<CtrlSum>628.45</CtrlSum>");
    // SEPA characters only: «Città» becomes «Citta».
    expect(xml).toContain("Agenzia Citta Due");
  });

  it("CONT-02 a broken file is caught by the schema", async () => {
    const xml = buildPain001({
      messageId: "X",
      createdAt: new Date("2026-11-30T07:00:00Z"),
      executionDate: "30/11/2026",
      debtor: { name: "AstAx", iban: "IT60X0542811101000000123456" },
      transfers: [
        {
          endToEndId: "e",
          amountCents: 1,
          creditorName: "A",
          creditorIban: "IT00",
          remittanceInfo: "r",
        },
      ],
    });
    expect((await validateXml("PAIN_001", xml)).valid).toBe(false);
  });

  it("rule 5 amounts are whole cents, written without floating point", () => {
    expect(xmlAmount(3500)).toBe("35.00");
    expect(xmlAmount(7)).toBe("0.07");
    expect(() => xmlAmount(1.5)).toThrow();
    expect(() =>
      buildPain001({
        messageId: "x",
        createdAt: new Date("2026-11-30T07:00:00Z"),
        executionDate: "2026-11-30",
        debtor: { name: "A", iban: "IT60X0542811101000000123456" },
        transfers: [],
      }),
    ).toThrow();
  });
});

describe("CONT-03 CONT-04 the FatturaPA invoices", () => {
  it("CONT-03 S01 the private customer's invoice P of 35,00 €, exempt N4, passes the official schema", async () => {
    const xml = buildFatturaPa(privateInvoice());
    const check = await validateXml("FATTURA_PA", xml);
    expect(check.errors).toEqual([]);
    expect(xml).toContain("<Natura>N4</Natura>");
    expect(xml).toContain("<CodiceFiscale>NREGLI85A41H501X</CodiceFiscale>");
    expect(xml).not.toContain("DatiBollo");
  });

  it("CONT-03 CONT-04 the agency's invoice A above the threshold: stamp duty charged, line N1", async () => {
    const xml = buildFatturaPa(
      privateInvoice({
        number: "A-2026-000001",
        customer: {
          vatNumber: "01234567890",
          name: "Agenzia Uno Srl",
          address: { street: "Via Esempio 9", postalCode: "00100", city: "Roma", province: "RM" },
        },
        recipientCode: "ABC1234",
        lines: [{ description: "Fee agenzia, 6 polizze", quantity: 6, unitCents: 1500 }],
        stampDutyCents: 200,
        stampDutyCharged: true,
        totalCents: 9200,
      }),
    );
    expect((await validateXml("FATTURA_PA", xml)).errors).toEqual([]);
    expect(xml).toContain("<ImportoBollo>2.00</ImportoBollo>");
    expect(xml).toContain("<Natura>N1</Natura>");
    expect(xml).toContain("<ImportoTotaleDocumento>92.00</ImportoTotaleDocumento>");
  });

  it("CONT-03 the broker's monthly invoice B with payment at 30 days, and a credit note TD04", async () => {
    const broker = privateInvoice({
      number: "B-2026-000001",
      customer: {
        vatNumber: "09876543210",
        name: "Broker Demo Srl",
        address: { street: "Via Prova 2", postalCode: "20100", city: "Milano", province: "MI" },
      },
      recipientCode: "XYZ9876",
      lines: [{ description: "Compensi novembre 2026", quantity: 1, unitCents: 3000 }],
      totalCents: 3000,
      dueDate: "2026-12-31",
    });
    expect((await validateXml("FATTURA_PA", buildFatturaPa(broker))).errors).toEqual([]);
    const credit = privateInvoice({
      documentType: "TD04",
      number: "N-2026-000001",
      correctedInvoice: { number: "P-2026-000001", date: "2026-11-16" },
    });
    expect((await validateXml("FATTURA_PA", buildFatturaPa(credit))).errors).toEqual([]);
  });

  it("the fake SDI: SENT, then DELIVERED; the VAT number 00000000000 is REJECTED; a bad XML is never sent", async () => {
    const clock = new ManualClock("2026-11-16T10:00:00Z");
    const sdi = new FakeEInvoicing(clock);
    const sent = await sdi.send(privateInvoice());
    expect(sent.status).toBe("SENT");
    expect(await sdi.getStatus(sent.sdiRef)).toBe("SENT");
    clock.advanceMs(5_000);
    expect(await sdi.getStatus(sent.sdiRef)).toBe("DELIVERED");
    const rejected = await sdi.send(
      privateInvoice({
        progressive: "A0000002",
        customer: {
          vatNumber: FAKE_REJECTED_VAT,
          name: "Prova Srl",
          address: { street: "Via X 1", postalCode: "00100", city: "Roma" },
        },
      }),
    );
    expect(rejected.status).toBe("REJECTED");
    await expect(sdi.send(privateInvoice({ date: "16/11/2026" }))).rejects.toBeInstanceOf(
      InvalidInvoiceXmlError,
    );
  });
});

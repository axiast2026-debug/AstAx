import { xmlAmount, xmlText } from "./validate.js";

/**
 * CONT-03, CONT-04: the electronic invoice in the FatturaPA 1.2.2 format.
 * The domain gives the data (amounts, nature, legal reference and stamp duty
 * from the parameters); this builds the XML (docs/adattatori.md, SDI).
 */
export interface FatturaPaParty {
  /** A company: VAT number; a person: fiscal code only. */
  vatNumber?: string | null;
  fiscalCode?: string | null;
  name: string;
  /** For a person: given name and surname instead of the name. */
  givenName?: string | null;
  surname?: string | null;
  address: { street: string; postalCode: string; city: string; province?: string | null };
}

export interface FatturaPaInput {
  /** The transmission number: the invoice's id, at most 10 characters. */
  progressive: string;
  documentType: "TD01" | "TD04";
  number: string;
  date: string;
  supplier: FatturaPaParty & { vatNumber: string };
  customer: FatturaPaParty;
  /** SDI code of the recipient, «0000000» for a private person. */
  recipientCode: string;
  recipientPec?: string | null;
  lines: { description: string; quantity: number; unitCents: number }[];
  vatNature: string;
  legalReference: string;
  stampDutyCents: number;
  /** The stamp duty charged to the recipient: an extra line, out of the VAT (N1). */
  stampDutyCharged: boolean;
  totalCents: number;
  /** For an invoice paid later: the due date (the broker's 30 days). */
  dueDate?: string | null;
  /** For a credit note: the invoice it corrects. */
  correctedInvoice?: { number: string; date: string } | null;
}

const text = (value: string, max: number) => xmlText(value.slice(0, max));

function party(p: FatturaPaParty, role: "supplier" | "customer"): string {
  const ids = [
    p.vatNumber
      ? `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${xmlText(p.vatNumber)}</IdCodice></IdFiscaleIVA>`
      : "",
    p.fiscalCode && !p.vatNumber ? `<CodiceFiscale>${xmlText(p.fiscalCode)}</CodiceFiscale>` : "",
  ].join("");
  const name =
    p.givenName && p.surname && !p.vatNumber
      ? `<Nome>${text(p.givenName, 60)}</Nome><Cognome>${text(p.surname, 60)}</Cognome>`
      : `<Denominazione>${text(p.name, 80)}</Denominazione>`;
  const tax = role === "supplier" ? "<RegimeFiscale>RF01</RegimeFiscale>" : "";
  const province = p.address.province
    ? `<Provincia>${xmlText(p.address.province.toUpperCase())}</Provincia>`
    : "";
  return `<DatiAnagrafici>${ids}<Anagrafica>${name}</Anagrafica>${tax}</DatiAnagrafici>
      <Sede><Indirizzo>${text(p.address.street, 60)}</Indirizzo><CAP>${xmlText(p.address.postalCode)}</CAP><Comune>${text(p.address.city, 60)}</Comune>${province}<Nazione>IT</Nazione></Sede>`;
}

export function buildFatturaPa(input: FatturaPaInput): string {
  // FPR12: invoices between private parties (not to the public administration).
  const format = "FPR12";
  const lines = input.lines.map((l, i) => ({
    n: i + 1,
    description: l.description,
    quantity: l.quantity,
    unitCents: l.unitCents,
    totalCents: l.quantity * l.unitCents,
    nature: input.vatNature,
  }));
  if (input.stampDutyCharged && input.stampDutyCents > 0) {
    lines.push({
      n: lines.length + 1,
      description: "Imposta di bollo",
      quantity: 1,
      unitCents: input.stampDutyCents,
      totalCents: input.stampDutyCents,
      nature: "N1",
    });
  }
  const byNature = new Map<string, number>();
  for (const l of lines) byNature.set(l.nature, (byNature.get(l.nature) ?? 0) + l.totalCents);
  const summary = [...byNature.entries()]
    .map(
      ([nature, cents]) => `
        <DatiRiepilogo>
          <AliquotaIVA>0.00</AliquotaIVA>
          <Natura>${xmlText(nature)}</Natura>
          <ImponibileImporto>${xmlAmount(cents)}</ImponibileImporto>
          <Imposta>0.00</Imposta>
          <RiferimentoNormativo>${text(
            nature === "N1" ? "Escluso art. 15 DPR 633/1972" : input.legalReference,
            100,
          )}</RiferimentoNormativo>
        </DatiRiepilogo>`,
    )
    .join("");
  const detail = lines
    .map(
      (l) => `
        <DettaglioLinee>
          <NumeroLinea>${l.n}</NumeroLinea>
          <Descrizione>${text(l.description, 1000)}</Descrizione>
          <Quantita>${l.quantity}.00</Quantita>
          <PrezzoUnitario>${xmlAmount(l.unitCents)}</PrezzoUnitario>
          <PrezzoTotale>${xmlAmount(l.totalCents)}</PrezzoTotale>
          <AliquotaIVA>0.00</AliquotaIVA>
          <Natura>${xmlText(l.nature)}</Natura>
        </DettaglioLinee>`,
    )
    .join("");
  const stamp =
    input.stampDutyCents > 0
      ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${xmlAmount(input.stampDutyCents)}</ImportoBollo></DatiBollo>`
      : "";
  const corrected = input.correctedInvoice
    ? `<DatiFattureCollegate><IdDocumento>${xmlText(input.correctedInvoice.number)}</IdDocumento><Data>${xmlText(input.correctedInvoice.date)}</Data></DatiFattureCollegate>`
    : "";
  const payment = input.dueDate
    ? `
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>${xmlText(input.dueDate)}</DataScadenzaPagamento>
        <ImportoPagamento>${xmlAmount(input.totalCents)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>`
    : "";
  const pec = input.recipientPec
    ? `<PECDestinatario>${xmlText(input.recipientPec)}</PECDestinatario>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="${format}" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${xmlText(input.supplier.vatNumber)}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>${xmlText(input.progressive.slice(0, 10))}</ProgressivoInvio>
      <FormatoTrasmissione>${format}</FormatoTrasmissione>
      <CodiceDestinatario>${xmlText(input.recipientCode)}</CodiceDestinatario>${pec}
    </DatiTrasmissione>
    <CedentePrestatore>
      ${party(input.supplier, "supplier")}
    </CedentePrestatore>
    <CessionarioCommittente>
      ${party(input.customer, "customer")}
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${input.documentType}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${xmlText(input.date)}</Data>
        <Numero>${xmlText(input.number)}</Numero>
        ${stamp}
        <ImportoTotaleDocumento>${xmlAmount(input.totalCents)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>${corrected}
    </DatiGenerali>
    <DatiBeniServizi>${detail}${summary}
    </DatiBeniServizi>${payment}
  </FatturaElettronicaBody>
</p:FatturaElettronica>
`;
}

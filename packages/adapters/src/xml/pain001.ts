import { xmlAmount, xmlText } from "./validate.js";

/**
 * CONT-02: the file of the remittances' transfers, generated in house
 * (docs/adattatori.md, «Generati in casa»), in the ISO 20022 format
 * `pain.001.001.03` that the banks accept for SEPA credit transfers. The back
 * office uploads it to the bank and marks the remittances as executed.
 */
export interface SepaTransfer {
  /** The remittance's id: the bank shows it back in the statement. */
  endToEndId: string;
  amountCents: number;
  creditorName: string;
  creditorIban: string;
  /** «Rimessa AstAx 30/11/2026»: no personal data (rule 8). */
  remittanceInfo: string;
}

export interface SepaFile {
  messageId: string;
  createdAt: Date;
  executionDate: string;
  debtor: { name: string; iban: string; bic?: string | null };
  transfers: readonly SepaTransfer[];
}

/** SEPA allows a restricted Latin set: other characters become spaces. */
const sepaText = (value: string, max: number) =>
  xmlText(
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
      .slice(0, max),
  );

const iban = (value: string) => value.replace(/\s/g, "").toUpperCase();

export function buildPain001(file: SepaFile): string {
  if (file.transfers.length === 0) throw new Error("A SEPA file has at least one transfer");
  for (const t of file.transfers) {
    if (!Number.isInteger(t.amountCents) || t.amountCents <= 0) {
      throw new Error("A transfer is a positive whole number of cents");
    }
  }
  const total = file.transfers.reduce((sum, t) => sum + t.amountCents, 0);
  const created = file.createdAt.toISOString().slice(0, 19);
  const debtorAgent = file.debtor.bic
    ? `<FinInstnId><BIC>${xmlText(file.debtor.bic)}</BIC></FinInstnId>`
    : "<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>";
  const transfers = file.transfers
    .map(
      (t) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${sepaText(t.endToEndId, 35)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${xmlAmount(t.amountCents)}</InstdAmt></Amt>
        <Cdtr><Nm>${sepaText(t.creditorName, 70)}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${xmlText(iban(t.creditorIban))}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${sepaText(t.remittanceInfo, 140)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${sepaText(file.messageId, 35)}</MsgId>
      <CreDtTm>${created}</CreDtTm>
      <NbOfTxs>${file.transfers.length}</NbOfTxs>
      <CtrlSum>${xmlAmount(total)}</CtrlSum>
      <InitgPty><Nm>${sepaText(file.debtor.name, 70)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${sepaText(file.messageId, 35)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${file.transfers.length}</NbOfTxs>
      <CtrlSum>${xmlAmount(total)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${xmlText(file.executionDate)}</ReqdExctnDt>
      <Dbtr><Nm>${sepaText(file.debtor.name, 70)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${xmlText(iban(file.debtor.iban))}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${debtorAgent}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${transfers}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

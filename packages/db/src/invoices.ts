import {
  addCalendarDays,
  linesByUnitAmount,
  invoiceNumber,
  invoiceTotals,
  monthBounds,
  romeInstant,
  type InvoiceLine,
  type InvoiceSeries,
} from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { settingsAt } from "./auction-data.js";
import type { DbTransaction } from "./client.js";
import type { Invoice } from "./generated/prisma/client.js";

/**
 * Who the invoice is addressed to (encrypted on the invoice, ADR 0007). An
 * invoice whose recipient lacks the fiscal data is kept «da completare» and
 * not sent (proposal D of phase 6).
 */
export interface InvoiceRecipient {
  name: string;
  givenName?: string | null;
  surname?: string | null;
  fiscalCode?: string | null;
  vatNumber?: string | null;
  address?: { street: string; postalCode: string; city: string; province?: string | null } | null;
  /** SDI code, «0000000» for a private person. */
  sdiCode?: string | null;
  pec?: string | null;
}

export interface StoredAddress {
  street: string;
  postalCode: string;
  municipalityIstat: string;
  province: string;
}

export interface NewInvoice {
  series: InvoiceSeries;
  recipientType: "PRIVATE" | "AGENCY" | "BROKER";
  ownerUserId: string | null;
  ownerOrganizationId: string | null;
  recipient: InvoiceRecipient;
  lines: InvoiceLine[];
  quoteRequestId?: string | null;
  remittanceId?: string | null;
  period?: string | null;
  dueOn?: string | null;
  creditedInvoiceId?: string | null;
}

const INVOICING_KEYS = [
  "invoicing.vatNature",
  "invoicing.legalReference",
  "invoicing.stampDuty.thresholdCents",
  "invoicing.stampDuty.amountCents",
  "invoicing.stampDuty.chargedTo",
] as const;

/** The municipality's name from its ISTAT code, for the address on the invoice. */
export async function invoiceAddress(
  tx: DbTransaction,
  address: StoredAddress,
): Promise<InvoiceRecipient["address"]> {
  const municipality = await tx.municipality.findUnique({
    where: { istatCode: address.municipalityIstat },
  });
  return {
    street: address.street,
    postalCode: address.postalCode,
    city: municipality?.name ?? address.municipalityIstat,
    province: address.province,
  };
}

/**
 * CONT-03, CONT-04, decisions 24 and 34: a fee invoice. The number is taken
 * in the caller's transaction from one counter row per series and year
 * (locked by the update until the commit), so numbers have no gaps even with
 * issues at the same moment. A system step: the caller runs it in the system
 * context. The delivery to SDI is the API's, after the commit.
 */
export async function createInvoice(
  tx: DbTransaction,
  encrypt: (plain: string) => string,
  input: NewInvoice,
  now: Date,
): Promise<Invoice> {
  const issuedOn = romeCalendarDate(now);
  const year = Number(issuedOn.slice(0, 4));
  const s = await settingsAt(tx, INVOICING_KEYS, now);
  // A credit note gives back an amount: no stamp duty on it.
  const totals = invoiceTotals(input.lines, {
    vatNature: s["invoicing.vatNature"],
    legalReference: s["invoicing.legalReference"],
    stampDutyThresholdCents:
      input.series === "N" ? Number.MAX_SAFE_INTEGER : s["invoicing.stampDuty.thresholdCents"],
    stampDutyCents: s["invoicing.stampDuty.amountCents"],
    stampDutyChargedTo: s["invoicing.stampDuty.chargedTo"],
  });
  const [counter] = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "InvoiceCounter" ("series", "year", "last")
    VALUES (${input.series}::"InvoiceSeries", ${year}, 1)
    ON CONFLICT ("series", "year") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
    RETURNING "last"`;
  const number = counter?.last ?? 0;
  return tx.invoice.create({
    data: {
      series: input.series,
      year,
      number,
      code: invoiceNumber(input.series, year, number),
      recipientType: input.recipientType,
      ownerUserId: input.ownerUserId,
      ownerOrganizationId: input.ownerOrganizationId,
      recipientEnc: encrypt(JSON.stringify(input.recipient)),
      lines: input.lines as unknown as object[],
      exemptCents: totals.exemptCents,
      stampDutyCents: totals.stampDutyCents,
      totalCents: totals.totalCents,
      vatNature: totals.vatNature,
      legalReference: totals.legalReference,
      issuedOn: new Date(issuedOn),
      dueOn: input.dueOn ? new Date(input.dueOn) : null,
      quoteRequestId: input.quoteRequestId ?? null,
      remittanceId: input.remittanceId ?? null,
      period: input.period ?? null,
      creditedInvoiceId: input.creditedInvoiceId ?? null,
      createdAt: now,
      updatedAt: now,
    },
  });
}

/**
 * Decision 24, CONT-05: on the first day of the month, one invoice B to each
 * broker for the fees (FEE-03) of the policies issued for its customers up
 * to the end of the month before and not billed yet; payment by transfer at
 * `invoicing.brokerPaymentTermDays`. Each policy is billed once (it keeps
 * the invoice): running it again adds nothing.
 */
export async function issueBrokerInvoices(
  tx: DbTransaction,
  encrypt: (plain: string) => string,
  period: string,
  lineDescription: string,
  now: Date,
): Promise<{ created: string[] }> {
  const { to } = monthBounds(period);
  const { "invoicing.brokerPaymentTermDays": termDays } = await settingsAt(
    tx,
    ["invoicing.brokerPaymentTermDays"],
    now,
  );
  const brokers = await tx.organization.findMany({
    where: { type: "BROKER" },
    orderBy: { id: "asc" },
  });
  const created: string[] = [];
  for (const broker of brokers) {
    // Every policy issued up to the end of the month and not billed yet: one
    // issued late (or after an invoice made mid-month) goes in the next one.
    const end = romeInstant(addCalendarDays(to, 1), "00:00");
    await tx.$queryRaw`
      SELECT 1 FROM "Policy"
      WHERE "ownerOrganizationId" = ${broker.id}::uuid AND "brokerInvoiceId" IS NULL
        AND "issuedAt" < ${end}
      FOR UPDATE`;
    const policies = await tx.policy.findMany({
      where: { ownerOrganizationId: broker.id, brokerInvoiceId: null, issuedAt: { lt: end } },
    });
    if (policies.length === 0) continue;
    const acceptances = await tx.acceptance.findMany({
      where: { id: { in: policies.map((p) => p.acceptanceId) } },
      select: { brokerFeeCents: true },
    });
    const lines = linesByUnitAmount(
      acceptances.map((a) => a.brokerFeeCents),
      `${lineDescription} ${period.slice(5)}/${period.slice(0, 4)}`,
    );
    if (lines.length === 0) continue;
    const address = broker.address as StoredAddress | null;
    const invoice = await createInvoice(
      tx,
      encrypt,
      {
        series: "B",
        recipientType: "BROKER",
        ownerUserId: null,
        ownerOrganizationId: broker.id,
        recipient: {
          name: broker.legalName,
          vatNumber: broker.vatNumber,
          address: address ? await invoiceAddress(tx, address) : null,
          sdiCode: "0000000",
          pec: broker.pec,
        },
        lines,
        period,
        dueOn: addCalendarDays(romeCalendarDate(now), termDays),
      },
      now,
    );
    await tx.policy.updateMany({
      where: { id: { in: policies.map((p) => p.id) } },
      data: { brokerInvoiceId: invoice.id, updatedAt: now },
    });
    created.push(invoice.id);
  }
  return { created };
}

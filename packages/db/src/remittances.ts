import {
  computeRemittance,
  invoiceTotals,
  remittanceCutoff,
  type Deduction,
} from "@astax/shared/domain";
import { settingsAt } from "./auction-data.js";
import type { DbTransaction } from "./client.js";

/**
 * CONT-01, EMI-05, decisions 23b and 25, proposal C of phase 6: the weekly
 * remittances, prepared as drafts for the back office to review. For each
 * agency, the policies issued up to the cutoff (Friday 23:59 in Rome) not
 * remitted yet; held back: the stamp duty of the agency's invoice, the broker's
 * quota when active, the premiums refunded to customers (PAG-04) and the
 * penalties applied or upheld, each for what is still due. What does not fit
 * stays due and is held next week (the lines record what each week took).
 * A system step: the caller runs it in the system context.
 */
export async function prepareRemittances(
  tx: DbTransaction,
  runDate: string,
  now: Date,
): Promise<{ created: string[] }> {
  const s = await settingsAt(
    tx,
    [
      "remittance.cutoff",
      "fees.agency.amountCents",
      "invoicing.vatNature",
      "invoicing.legalReference",
      "invoicing.stampDuty.thresholdCents",
      "invoicing.stampDuty.amountCents",
      "invoicing.stampDuty.chargedTo",
      "brokerCommission.enabled",
      "brokerCommission.percentOfNetPremium",
    ],
    now,
  );
  const cutoffAt = remittanceCutoff(runDate, s["remittance.cutoff"]);
  const remitted = await tx.remittanceLine.findMany({
    where: { kind: "POLICY" },
    select: { ref: true },
  });
  const done = new Set(remitted.map((l) => l.ref));
  const agencies = await tx.organization.findMany({
    where: { type: "AGENCY" },
    orderBy: { id: "asc" },
  });
  const created: string[] = [];
  for (const agency of agencies) {
    const existing = await tx.remittance.findUnique({
      where: { organizationId_runDate: { organizationId: agency.id, runDate: new Date(runDate) } },
    });
    if (existing) continue;
    const policies = (
      await tx.policy.findMany({
        where: { organizationId: agency.id, issuedAt: { lte: cutoffAt } },
        orderBy: { issuedAt: "asc" },
      })
    ).filter((p) => !done.has(p.id));
    if (policies.length === 0) continue;
    const agencyFee = s["fees.agency.amountCents"];
    const deductions: Deduction[] = [];
    // Proposal C: the stamp duty of the agency's invoice, charged to it and held here.
    const invoice = invoiceTotals(
      [{ description: "fee", quantity: policies.length, unitCents: agencyFee }],
      {
        vatNature: s["invoicing.vatNature"],
        legalReference: s["invoicing.legalReference"],
        stampDutyThresholdCents: s["invoicing.stampDuty.thresholdCents"],
        stampDutyCents: s["invoicing.stampDuty.amountCents"],
        stampDutyChargedTo: s["invoicing.stampDuty.chargedTo"],
      },
    );
    if (invoice.totalCents > invoice.exemptCents) {
      deductions.push({ kind: "STAMP_DUTY", ref: agency.id, cents: invoice.stampDutyCents });
    }
    // Decision 25: the broker's quota, off until the lawyer validates it.
    if (s["brokerCommission.enabled"] && s["brokerCommission.percentOfNetPremium"] > 0) {
      for (const p of policies.filter((x) => x.ownerOrganizationId)) {
        const cents = Math.floor(
          (p.premiumCents * s["brokerCommission.percentOfNetPremium"]) / 100,
        );
        if (cents <= 0) continue;
        await tx.brokerCommission.upsert({
          where: { policyId: p.id },
          create: {
            policyId: p.id,
            organizationId: p.ownerOrganizationId ?? "",
            amountCents: cents,
            createdAt: now,
            updatedAt: now,
          },
          update: {},
        });
        deductions.push({ kind: "BROKER_SHARE", ref: p.id, cents });
      }
    }
    const heldBefore = async (kind: "RECOVERY" | "PENALTY", ref: string) =>
      (
        await tx.remittanceLine.aggregate({
          where: { kind, ref },
          _sum: { appliedCents: true },
        })
      )._sum.appliedCents ?? 0;
    // PAG-04: the premiums refunded after the issuance, recovered from the agency.
    const refunds = await tx.refund.findMany({
      where: { recoverFromOrganizationId: agency.id, status: "EXECUTED" },
      orderBy: { executedAt: "asc" },
    });
    for (const r of refunds) {
      const left = r.premiumCents - (await heldBefore("RECOVERY", r.id));
      if (left > 0) deductions.push({ kind: "RECOVERY", ref: r.id, cents: left });
    }
    // EMI-05: applied (or upheld) penalties; a contested one waits for the decision.
    const penalties = await tx.penalty.findMany({
      where: { organizationId: agency.id, status: { in: ["APPLIED", "UPHELD"] } },
      orderBy: { appliedAt: "asc" },
    });
    for (const p of penalties) {
      const left = p.amountCents - (await heldBefore("PENALTY", p.id));
      if (left > 0) deductions.push({ kind: "PENALTY", ref: p.id, cents: left });
    }
    const result = computeRemittance(
      policies.map((p) => ({
        policyId: p.id,
        premiumCents: p.premiumCents,
        agencyFeeCents: agencyFee,
      })),
      deductions,
    );
    const remittance = await tx.remittance.create({
      data: {
        organizationId: agency.id,
        runDate: new Date(runDate),
        cutoffAt,
        grossCents: result.grossCents,
        feesCents: result.feesCents,
        heldCents: Object.values(result.held).reduce((a, b) => a + b, 0),
        netCents: result.netCents,
        carriedCents: result.carriedCents,
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.remittanceLine.createMany({
      data: [
        ...policies.map((p) => ({
          remittanceId: remittance.id,
          organizationId: agency.id,
          kind: "POLICY" as const,
          ref: p.id,
          requestedCents: p.premiumCents,
          appliedCents: agencyFee,
          createdAt: now,
        })),
        ...result.applied
          .filter((d) => d.kind !== "CARRIED_OVER")
          .map((d) => ({
            remittanceId: remittance.id,
            organizationId: agency.id,
            kind: d.kind as "STAMP_DUTY" | "BROKER_SHARE" | "RECOVERY" | "PENALTY",
            ref: d.ref,
            requestedCents: d.cents,
            appliedCents: d.appliedCents,
            createdAt: now,
          })),
      ],
    });
    created.push(remittance.id);
  }
  return { created };
}

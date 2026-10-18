import type { DbTransaction } from "./client.js";

/**
 * At the owner's first access after the approval: the contracts accepted in
 * the entry count as accepted by the owner (LEG-01, with the entry's time and
 * IP), so they are not asked again.
 */
export async function carryOnboardingAcceptances(
  tx: DbTransaction,
  userId: string,
  emailHash: string,
  organizationIds: readonly string[],
): Promise<number> {
  const applications = await tx.onboardingApplication.findMany({
    where: {
      status: "APPROVED",
      ownerEmailHash: emailHash,
      organizationId: { in: [...organizationIds] },
    },
  });
  let created = 0;
  for (const a of applications) {
    for (const versionId of a.acceptedVersionIds) {
      const already = await tx.legalAcceptance.findFirst({ where: { userId, versionId } });
      if (already || !a.acceptedAt) continue;
      await tx.legalAcceptance.create({
        data: {
          userId,
          versionId,
          acceptedAt: a.acceptedAt,
          ip: a.acceptedIp,
          userAgent: a.acceptedUserAgent,
          method: "CLICK",
        },
      });
      created += 1;
    }
  }
  return created;
}

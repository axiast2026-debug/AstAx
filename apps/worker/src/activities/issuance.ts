import { addRequestEvent, settingsAt, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { formatDateTime } from "@astax/shared/format";
import type { PendingEmail } from "../notifier.js";
import { agencyRecipients, staffRecipients, type ActivityDeps } from "./support.js";
import type { AuctionActivities, IssuanceSchedule } from "./types.js";

/**
 * EMI-01 in phase 5 (proposal H): the deadline was computed at the payment;
 * the agency and the back office are reminded issuance.reminderMinutesBefore
 * it. The missed issuance (EMI-04) is phase 6.
 */
export function issuanceActivities(
  deps: ActivityDeps,
): Pick<AuctionActivities, "issuanceSchedule" | "sendIssuanceReminder"> {
  const { db, clock, cipher, notifier, urls } = deps;

  async function issuanceSchedule(input: { requestId: string }): Promise<IssuanceSchedule> {
    return withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const paid = await tx.acceptance.findFirst({
        where: { quoteRequestId: input.requestId, status: "PAID" },
      });
      if (!paid?.issuanceDeadlineAt) return { deadlineAt: null, reminderAt: null };
      const { "issuance.reminderMinutesBefore": minutes } = await settingsAt(
        tx,
        ["issuance.reminderMinutesBefore"],
        clock.now(),
      );
      return {
        deadlineAt: paid.issuanceDeadlineAt.toISOString(),
        reminderAt: new Date(paid.issuanceDeadlineAt.getTime() - minutes * 60_000).toISOString(),
      };
    });
  }

  async function sendIssuanceReminder(input: { requestId: string }) {
    const pending: PendingEmail[] = [];
    await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      if (request.status !== "IN_ISSUANCE") return;
      const sent = await tx.quoteRequestEvent.count({
        where: { quoteRequestId: request.id, type: "ISSUANCE_REMINDER_SENT" },
      });
      if (sent > 0) return;
      const paid = await tx.acceptance.findFirstOrThrow({
        where: { quoteRequestId: request.id, status: "PAID" },
      });
      const offer = await tx.offer.findUniqueOrThrow({ where: { id: paid.offerId } });
      const agency = await tx.organization.findUniqueOrThrow({
        where: { id: offer.organizationId },
      });
      const { "issuance.reminderMinutesBefore": minutes } = await settingsAt(
        tx,
        ["issuance.reminderMinutesBefore"],
        clock.now(),
      );
      const term = paid.issuanceDeadlineAt ? formatDateTime(paid.issuanceDeadlineAt) : "";
      await notifier.notify(
        tx,
        pending,
        await agencyRecipients(tx, cipher, [offer.organizationId]),
        "issuance.deadline_near",
        () => ({
          codice: request.code,
          minuti: String(minutes),
          termine_emissione: term,
          link: `${urls.web}/da-emettere`,
        }),
        "/da-emettere",
        { quoteRequestId: request.id },
      );
      await notifier.notify(
        tx,
        pending,
        await staffRecipients(tx, cipher, ["BO_VERIFIER", "BO_SUPERVISOR"]),
        "issuance.deadline_near.bo",
        () => ({
          codice: request.code,
          agenzia: agency.legalName,
          termine_emissione: term,
          link: `${urls.admin}/aste`,
        }),
        "/aste",
        { quoteRequestId: request.id },
      );
      await addRequestEvent(tx, request, {
        type: "ISSUANCE_REMINDER_SENT",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: clock.now(),
      });
    });
    await notifier.flush(pending);
  }

  return { issuanceSchedule, sendIssuanceReminder };
}

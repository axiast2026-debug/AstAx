import type { DbTransaction } from "./client.js";
import { randomUUID } from "node:crypto";
import { addCalendarDays, endOfRomeDay } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { settingsAt } from "./auction-data.js";

const DAY_MS = 86_400_000;

/** Calendar days in Rome between two dates «YYYY-MM-DD» (rule 6, no hours involved). */
const daysFrom = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export interface NewComplaint {
  receivedAt: Date;
  channel: string;
  complainantUserId: string | null;
  complainantName: string;
  complainantEmailEnc: string | null;
  customerId: string | null;
  quoteRequestId: string | null;
  organizationId: string | null;
  subject: string;
  description: string;
  createdByUserId: string | null;
}

/** «R-2026-000012»: the year of receipt in Rome and the number of the register. */
export function complaintProtocol(year: number, number: number): string {
  return `R-${year}-${String(number).padStart(6, "0")}`;
}

const romeYear = (at: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric" }).format(at));

/**
 * Registers a complaint: the protocol, and the answer due within
 * complaints.responseDays calendar days of the receipt (in force at the receipt).
 */
export async function registerComplaint(tx: DbTransaction, input: NewComplaint, now: Date) {
  const { "complaints.responseDays": days } = await settingsAt(
    tx,
    ["complaints.responseDays"],
    input.receivedAt,
  );
  const created = await tx.complaint.create({
    data: {
      ...input,
      // A placeholder for the instant between the insert and the protocol below.
      protocol: `pending-${randomUUID()}`,
      // The end of the Rome day, complaints.responseDays calendar days after the receipt.
      dueAt: endOfRomeDay(addCalendarDays(romeCalendarDate(input.receivedAt), days)),
      createdAt: now,
    },
  });
  // The number comes from the database sequence: the protocol follows it.
  return tx.complaint.update({
    where: { id: created.id },
    data: { protocol: complaintProtocol(romeYear(input.receivedAt), created.number) },
  });
}

/**
 * The open complaints whose answer is due within complaints.reminderDaysBefore
 * days and not reminded yet; marked as reminded in the same transaction.
 */
export async function complaintsToRemind(tx: DbTransaction, now: Date) {
  const { "complaints.reminderDaysBefore": days } = await settingsAt(
    tx,
    ["complaints.reminderDaysBefore"],
    now,
  );
  const due = await tx.complaint.findMany({
    where: {
      status: "OPEN",
      reminderSentAt: null,
      // Due on or before the Rome day that is reminderDaysBefore days from today.
      dueAt: { lte: endOfRomeDay(addCalendarDays(romeCalendarDate(now), days)) },
    },
    orderBy: { dueAt: "asc" },
  });
  if (due.length > 0) {
    await tx.complaint.updateMany({
      where: { id: { in: due.map((c) => c.id) } },
      data: { reminderSentAt: now },
    });
  }
  return due.map((c) => ({
    id: c.id,
    protocol: c.protocol,
    dueAt: c.dueAt,
    daysLeft: Math.max(0, daysFrom(romeCalendarDate(now), romeCalendarDate(c.dueAt))),
  }));
}

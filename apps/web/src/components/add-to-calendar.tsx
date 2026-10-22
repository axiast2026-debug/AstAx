"use client";

import { Icon } from "@astax/ui";

const icsTime = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (text: string) => text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/**
 * Proposal P4: a deadline in the customer's own calendar, as a file made on
 * the device (nothing leaves it): an event in its last half hour, such as the
 * end of a guaranteed price (23:59:59 in Rome, GAR-02) or an auction's closing.
 */
export function AddToCalendar({
  expiresAt,
  uid,
  summary,
  description,
  label,
  alarmBefore = "PT12H",
}: {
  expiresAt: string;
  uid: string;
  summary: string;
  description: string;
  label: string;
  /** How long before the end the calendar warns (iCalendar duration). */
  alarmBefore?: string;
}) {
  const download = () => {
    const end = new Date(expiresAt);
    const start = new Date(end.getTime() - 30 * 60_000);
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AstAx//Prezzo garantito//IT",
      "BEGIN:VEVENT",
      `UID:${uid}@astax`,
      `DTSTAMP:${icsTime(start.toISOString())}`,
      `DTSTART:${icsTime(start.toISOString())}`,
      `DTEND:${icsTime(end.toISOString())}`,
      `SUMMARY:${icsText(summary)}`,
      `DESCRIPTION:${icsText(description)}`,
      "BEGIN:VALARM",
      `TRIGGER:-${alarmBefore}`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(summary)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "astax-prezzo-garantito.ics";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex min-h-11 items-center gap-2 self-start text-label font-semibold underline underline-offset-2 hover:text-orange-700"
    >
      <Icon name="calendarPlus" />
      {label}
    </button>
  );
}

"use client";

import { Icon } from "@astax/ui";

const icsTime = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (text: string) => text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/**
 * Proposal P4: the end of the guaranteed price in the customer's own
 * calendar, as a file made on the device (nothing leaves it): an event in the
 * last half hour, ending at 23:59:59 in Rome of the guarantee day (GAR-02).
 */
export function AddToCalendar({
  expiresAt,
  uid,
  summary,
  description,
  label,
}: {
  expiresAt: string;
  uid: string;
  summary: string;
  description: string;
  label: string;
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
      "TRIGGER:-PT12H",
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

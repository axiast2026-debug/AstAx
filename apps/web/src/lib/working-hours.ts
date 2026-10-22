import { DISPLAY_TIME_ZONE } from "@astax/shared/format";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = (typeof DAYS)[number];
export type WeeklyHours = Record<Day, [string, string][]>;

/** The Italian name of a weekday: 2024-01-01 was a Monday. */
function dayName(index: number): string {
  return new Intl.DateTimeFormat("it-IT", { weekday: "long", timeZone: DISPLAY_TIME_ZONE }).format(
    new Date(Date.UTC(2024, 0, 1 + index, 12)),
  );
}

/** «09:00» → «9», «13:30» → «13:30». */
const hour = (time: string) => {
  const [h = "0", m = "00"] = time.split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
};

/**
 * The working hours of the calendar parameter in words, for the public pages
 * (rule 7: from the parameter, never in the texts): consecutive days with the
 * same hours together, days without hours left out.
 * «lunedì–venerdì 9–19, sabato 9–13».
 */
export function workingHoursText(hours: WeeklyHours): string {
  const slots = DAYS.map((d) =>
    hours[d].map(([from, to]) => `${hour(from)}–${hour(to)}`).join(", "),
  );
  const groups: { from: number; to: number; text: string }[] = [];
  slots.forEach((text, i) => {
    const last = groups.at(-1);
    if (text && last && last.text === text && last.to === i - 1) last.to = i;
    else if (text) groups.push({ from: i, to: i, text });
  });
  return groups
    .map((g) =>
      g.from === g.to
        ? `${dayName(g.from)} ${g.text}`
        : `${dayName(g.from)}–${dayName(g.to)} ${g.text}`,
    )
    .join(", ");
}

/** «MONDAY» → «lunedì»: the day of a weekly parameter. */
export function weekdayName(day: string): string {
  const index = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ].indexOf(day);
  return index < 0 ? day : dayName(index);
}

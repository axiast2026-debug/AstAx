import { formatTime, formatWeekdayDate, romeCalendarDate } from "@astax/shared/format";
import { getTranslations } from "next-intl/server";

/**
 * A time in words from the server's day (rule 6, Rome): «oggi alle 12:00»,
 * «domani alle 9:00» or «lunedì 16/11 alle 9:00».
 */
export async function whenWords(serverNow: string): Promise<(at: string) => string> {
  const t = await getTranslations("auctionView");
  const today = romeCalendarDate(new Date(serverNow));
  const tomorrow = romeCalendarDate(new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000));
  return (at: string) => {
    const day = romeCalendarDate(new Date(at));
    if (day === today) return t("todayAt", { time: formatTime(at) });
    if (day === tomorrow) return t("tomorrowAt", { time: formatTime(at) });
    return t("dayAt", { day: formatWeekdayDate(at), time: formatTime(at) });
  };
}

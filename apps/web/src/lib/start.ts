import { formatDate, formatDateTime } from "@astax/shared/format";
import { getTranslations } from "next-intl/server";

/**
 * Question 1 (docs/piano-decorrenza.md): the start of cover as the pages show
 * it. A chosen date; the exact start of an issued policy when it is not
 * midnight («immediata»); otherwise the name of the mode. `startTexts()` is
 * awaited once per page; the function it returns works inside lists.
 */
export async function startTexts() {
  const t = await getTranslations("startModeShort");
  return (input: {
    startMode?: string | null;
    startDate: string | null;
    startsAt?: string | null;
  }): string => {
    if (input.startsAt) {
      const at = formatDateTime(input.startsAt);
      return at.endsWith("00:00") && input.startDate ? formatDate(input.startDate) : at;
    }
    const mode = input.startMode ?? "DATE";
    if (mode === "ON_ISSUANCE" || mode === "MIDNIGHT_AFTER_DEADLINE") return t(mode);
    return input.startDate ? formatDate(input.startDate) : "";
  };
}

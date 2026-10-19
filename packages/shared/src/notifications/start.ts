import type { StartMode } from "../domain/quote-data.js";
import { formatDate, formatDateTime } from "../format/index.js";

/**
 * `{{decorrenza}}` in the notifications (question 1, docs/piano-decorrenza.md):
 * the chosen date; the exact start once known (24:00 of the deadline day
 * after the payment, the issuance for «immediata»); before that, the label of
 * the mode in the recipient's language.
 */
export function startForNotice(
  input: { startMode?: StartMode | null; startDate: string; coverStartsAt?: Date | null },
  modeLabel: (key: string) => string,
): string {
  const mode = input.startMode ?? "DATE";
  if (mode === "DATE") return formatDate(input.startDate);
  if (input.coverStartsAt) return formatDateTime(input.coverStartsAt);
  return modeLabel(`startMode.${mode}`);
}

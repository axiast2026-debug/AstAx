import type { IconName } from "@astax/ui";

/**
 * The icon of an in-app notice by its event (centro notifiche of the design):
 * the first matching prefix wins; anything else gets the information sign.
 */
const RULES: [RegExp, IconName][] = [
  [/excluded|failed|missed|passed|problem|penalty|suspended|cancelled|deserted/, "warning"],
  [/^(auction\.closed|ranking\.)/, "envelopeOpen"],
  [/^auction\./, "clock"],
  [/^(guarantee\.|request\.expired|reconfirmation\.|request\.auto_cancelled)/, "hourglass"],
  [/^(offer\.won|policy\.issued)/, "shieldCheck"],
  [/^(payment\.confirmed|refund\.executed|remittance\.)/, "checkCircle"],
  [/^(invoice\.|consent\.|offer\.link_to_client)/, "document"],
  [/^(request\.|batch\.)/, "envelope"],
  [/^(team\.|onboarding\.)/, "user"],
  [/^renewal\./, "refresh"],
];

export function notificationIcon(eventKey: string): IconName {
  return RULES.find(([pattern]) => pattern.test(eventKey))?.[1] ?? "info";
}

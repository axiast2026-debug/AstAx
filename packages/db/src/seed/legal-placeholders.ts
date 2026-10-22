import type { LegalAudience, LegalMoment } from "../generated/prisma/client.js";

/** Shown by every legal text until the lawyer validates it (CLAUDE.md rule 10, LEG-03). */
export const LEGAL_PLACEHOLDER_MARK = "[DA VALIDARE — LEGALE]";

export interface LegalPlaceholder {
  key: string;
  title: string;
  audiences: LegalAudience[];
  moment: LegalMoment;
  channel: string | null;
}

/** The documents of docs/specifiche/09, §7. Titles are data shown to users, in Italian. */
export const LEGAL_PLACEHOLDERS: readonly LegalPlaceholder[] = [
  {
    key: "terms-private",
    title: "Condizioni d'uso per i privati",
    audiences: ["PRIVATE"],
    moment: "REGISTRATION",
    channel: "PRIVATE",
  },
  {
    key: "privacy-sharing-consent",
    title: "Informativa privacy e consenso alla condivisione con le agenzie",
    audiences: ["PRIVATE", "BROKER"],
    moment: "BEFORE_REQUEST",
    channel: null,
  },
  {
    key: "engagement-letter",
    title: "Lettera di incarico ad AstAx",
    audiences: ["PRIVATE"],
    moment: "ACCEPTANCE",
    channel: "PRIVATE",
  },
  {
    key: "precontractual-information",
    title: "Informativa precontrattuale (MUP)",
    audiences: ["PRIVATE"],
    moment: "ACCEPTANCE",
    channel: null,
  },
  {
    key: "fea-terms",
    title: "Condizioni del servizio di firma FEA",
    audiences: ["PRIVATE"],
    moment: "FIRST_SIGNATURE",
    channel: null,
  },
  {
    key: "terms-professional",
    title: "Condizioni d'uso per i professionisti, con penali e non aggiramento",
    audiences: ["BROKER", "AGENCY", "SUB_AGENT"],
    moment: "ONBOARDING",
    channel: null,
  },
  {
    key: "agency-agreement",
    title: "Accordo di collaborazione con le agenzie",
    audiences: ["AGENCY"],
    moment: "ONBOARDING",
    channel: null,
  },
  {
    key: "broker-agreement",
    title: "Accordo di collaborazione con i broker",
    audiences: ["BROKER"],
    moment: "ONBOARDING",
    channel: "BROKER",
  },
  {
    // Dan, 2026-10-21 (docs/piano-broker.md, answer 3): one declaration in place
    // of the consent of every customer; to be confirmed by the lawyer (LEG-04).
    key: "broker-clients-declaration",
    title: "Dichiarazione dell'intermediario sul consenso dei propri clienti",
    // ADR 0015: the agencies that request quotes too.
    audiences: ["BROKER", "AGENCY"],
    moment: "ONBOARDING",
    channel: "BROKER",
  },
  {
    key: "data-processing-agreement",
    title: "Accordo sul trattamento dei dati",
    audiences: ["AGENCY", "BROKER"],
    moment: "ONBOARDING",
    channel: null,
  },
  {
    key: "cookie-policy",
    title: "Cookie policy",
    audiences: ["ALL"],
    moment: "FIRST_ACCESS",
    channel: null,
  },
];

export function placeholderContent(title: string): string {
  return `${LEGAL_PLACEHOLDER_MARK}\n\n# ${title}\n\nTesto segnaposto. Il testo definitivo lo scrive e lo valida il legale.\n`;
}

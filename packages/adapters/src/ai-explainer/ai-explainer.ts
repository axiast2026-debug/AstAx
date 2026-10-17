/**
 * The explanation of the AI comparison (docs/adattatori.md; real model Claude
 * on Amazon Bedrock, EU inference profile, in phase 8). The domain computes
 * the score (PRES-07); the model only writes a short text from those data,
 * without personal data, which the API checks before showing it.
 */
export interface ScoredOfferSummary {
  offerId: string;
  company: string;
  product: string;
  /** Already formatted, as the customer reads it («520,00 €»). */
  premium: string;
  guaranteeDaysLeft: number;
  total: number;
}

export interface AiWeightsSummary {
  price: number;
  coverage: number;
  companyComplaints: number;
  agencyIssuanceSpeed: number;
}

export interface AiExplainerPort {
  explain(input: {
    offers: ScoredOfferSummary[];
    recommendedOfferId: string;
    weights: AiWeightsSummary;
    locale: "it";
  }): Promise<{ text: string; model: string; promptVersion: string }>;
}

export const FAKE_EXPLAINER_MODEL = "fake-ai-explainer";
export const FAKE_EXPLAINER_PROMPT_VERSION = "fake-1";

/**
 * The fake: a text from a fixed model, with the data it received only (rule 9).
 * It stands for the model's output, so the API's check still applies to it.
 */
export class FakeAiExplainer implements AiExplainerPort {
  async explain(input: {
    offers: ScoredOfferSummary[];
    recommendedOfferId: string;
    weights: AiWeightsSummary;
    locale: "it";
  }) {
    const best = input.offers.find((o) => o.offerId === input.recommendedOfferId);
    if (!best) throw new Error("The recommended offer is not among the offers");
    const others = input.offers.filter((o) => o.offerId !== best.offerId);
    const cheaper = others.filter((o) => o.total < best.total).length;
    const text =
      `Tra le offerte ancora garantite, ${best.company} (${best.product}, ${best.premium}) ` +
      `ha il miglior equilibrio tra prezzo, coperture e affidabilità secondo i criteri del confronto. ` +
      `Il prezzo resta garantito per ${best.guaranteeDaysLeft} giorni.` +
      (others.length > 0 && cheaper === 0
        ? " Le altre offerte ottengono un punteggio più basso."
        : "");
    return { text, model: FAKE_EXPLAINER_MODEL, promptVersion: FAKE_EXPLAINER_PROMPT_VERSION };
  }
}

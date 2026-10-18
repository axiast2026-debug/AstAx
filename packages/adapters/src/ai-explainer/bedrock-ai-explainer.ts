import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  loadPrompt,
  type BedrockOptions,
  type ConverseClient,
} from "../document-reader/bedrock-document-reader.js";
import type { AiExplainerPort, AiWeightsSummary, ScoredOfferSummary } from "./ai-explainer.js";

export const EXPLAINER_PROMPT_VERSION = "ai-explainer/v1";

/**
 * Phase 8: Claude on Amazon Bedrock writes the short explanation of the AI
 * comparison (PRES-07). It receives only the offers' summaries and the
 * weights, no personal data; the API checks the text before showing it
 * (the recommended offer cited, no figures other than those given) and falls
 * back to a text built from the score otherwise.
 */
export class BedrockAiExplainer implements AiExplainerPort {
  readonly #client: ConverseClient;
  readonly #prompt = loadPrompt("ai-explainer/v1");

  constructor(private readonly options: BedrockOptions) {
    this.#client = options.client ?? new BedrockRuntimeClient({ region: options.region });
  }

  async explain(input: {
    offers: ScoredOfferSummary[];
    recommendedOfferId: string;
    weights: AiWeightsSummary;
    locale: "it";
  }) {
    const data = {
      offertaConsigliata: input.recommendedOfferId,
      pesi: input.weights,
      offerte: input.offers.map((o) => ({
        id: o.offerId,
        compagnia: o.company,
        prodotto: o.product,
        premio: o.premium,
        giorniDiGaranzia: o.guaranteeDaysLeft,
        punteggio: o.total,
      })),
    };
    const response = await this.#client.send(
      new ConverseCommand({
        modelId: this.options.modelId,
        system: [{ text: this.#prompt }],
        messages: [{ role: "user", content: [{ text: JSON.stringify(data) }] }],
        inferenceConfig: { maxTokens: 400, temperature: 0.2 },
      }),
    );
    const text = (response.output?.message?.content ?? [])
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    return { text, model: this.options.modelId, promptVersion: EXPLAINER_PROMPT_VERSION };
  }
}

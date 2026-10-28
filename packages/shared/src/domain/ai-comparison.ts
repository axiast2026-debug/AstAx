import { compareOffers, type RankedOffer } from "./auction-rules.js";
import { COINSURANCE_COVERAGES, type OfferCoverage, type PackageRequirements } from "./coverage.js";

/**
 * The AI comparison (PRES-06…08, proposal C of phase 5). The domain computes
 * the score with fixed criteria and the weights of `ai.weights`; the AI model
 * writes only the explanation, from these data. Scores from 0 to 1, higher
 * is better; a criterion without data is neutral (0.5).
 */

export interface AiWeights {
  price: number;
  coverage: number;
  companyComplaints: number;
  agencyIssuanceSpeed: number;
}

export interface AiCandidate extends RankedOffer {
  /** Items better than the package asks (coverageImprovements). */
  coverageImprovements: number;
  /** IVASS complaints index of the company: lower is better; null when unknown. */
  companyComplaintsIndex: number | null;
  /** Average issuance time of the agency on the platform; null when it has no history. */
  agencyIssuanceMinutes: number | null;
}

export interface AiCriteriaScores {
  price: number;
  coverage: number;
  companyComplaints: number;
  agencyIssuanceSpeed: number;
}

export interface AiScoredOffer {
  offerId: string;
  scores: AiCriteriaScores;
  total: number;
}

export interface AiScoring {
  offers: AiScoredOffer[];
  recommendedOfferId: string;
}

const NEUTRAL = 0.5;
const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Lower is better: the best value over the candidate's (1 for the best one). */
function lowerIsBetter(value: number | null, values: (number | null)[]): number {
  const known = values.filter((v): v is number => v !== null);
  if (value === null || known.length === 0) return NEUTRAL;
  const best = Math.min(...known);
  if (value <= 0) return 1;
  return best / value;
}

/**
 * PRES-07: only the offers shown and still guaranteed (the caller passes
 * those). Price: lowest premium over the premium. Coverage: improvements over
 * the most improved offer (neutral when no offer improves anything).
 * Complaints and issuance speed: lower is better, neutral without data. The
 * recommended offer has the highest total; a tie follows PRES-01.
 */
export function scoreOffers(candidates: readonly AiCandidate[], weights: AiWeights): AiScoring {
  if (candidates.length === 0) throw new Error("No offer to compare");
  const minPremium = Math.min(...candidates.map((c) => c.annualGrossPremiumCents));
  const maxImprovements = Math.max(...candidates.map((c) => c.coverageImprovements));
  const offers = candidates.map((c) => {
    const scores: AiCriteriaScores = {
      price: round(minPremium / c.annualGrossPremiumCents),
      coverage: round(maxImprovements === 0 ? NEUTRAL : c.coverageImprovements / maxImprovements),
      companyComplaints: round(
        lowerIsBetter(
          c.companyComplaintsIndex,
          candidates.map((x) => x.companyComplaintsIndex),
        ),
      ),
      agencyIssuanceSpeed: round(
        lowerIsBetter(
          c.agencyIssuanceMinutes,
          candidates.map((x) => x.agencyIssuanceMinutes),
        ),
      ),
    };
    const total = round(
      scores.price * weights.price +
        scores.coverage * weights.coverage +
        scores.companyComplaints * weights.companyComplaints +
        scores.agencyIssuanceSpeed * weights.agencyIssuanceSpeed,
    );
    return { candidate: c, offer: { offerId: c.id, scores, total } };
  });
  const best = [...offers].sort(
    (a, b) => b.offer.total - a.offer.total || compareOffers(a.candidate, b.candidate),
  )[0] as (typeof offers)[number];
  return { offers: offers.map((o) => o.offer), recommendedOfferId: best.offer.offerId };
}

/**
 * PRES-07: the items of the declared coverage better than the package asks:
 * an item it does not require, a higher limit or capital, more recourse
 * cases, a lower deductible, coinsurance or minimum.
 */
export function coverageImprovements(
  required: PackageRequirements,
  declared: OfferCoverage,
): number {
  let n = 0;
  const minLimit =
    required.rca.limitType === "SINGLE_LIMIT" ? required.rca.minSingleLimitEur : null;
  if (minLimit !== null && declared.rca.limitType === "SINGLE_LIMIT") {
    if (declared.rca.singleLimitEur > minLimit) n += 1;
  }
  const rw = required.recourseWaiver;
  if (declared.recourseWaiver.included) {
    if (!rw.required) n += 1;
    else if (declared.recourseWaiver.cases.length > rw.minCases.length) n += 1;
  }
  for (const item of ["roadsideAssistance", "legalProtection"] as const) {
    if (declared[item].included && !required[item].required) n += 1;
  }
  const da = required.driverAccident;
  if (declared.driverAccident.included) {
    if (!da.required || declared.driverAccident.capitalEur > da.minCapitalEur) n += 1;
  }
  for (const item of COINSURANCE_COVERAGES) {
    const d = declared[item];
    const r = required[item];
    if (!d.included) continue;
    if (!r.required) n += 1;
    else if (d.coinsurancePct < r.maxCoinsurancePct || d.coinsuranceMinEur < r.maxCoinsuranceMinEur)
      n += 1;
  }
  const gl = required.glass;
  if (declared.glass.included) {
    if (!gl.required || declared.glass.deductibleEur < gl.maxDeductibleEur) n += 1;
  }
  return n;
}

export type AiTextProblem = "TOO_LONG" | "NO_RECOMMENDED_OFFER" | "FOREIGN_NUMBER" | "EMPTY";

/**
 * Proposal D of phase 5: the explanation is shown only if it names the
 * recommended offer (its company), is within ai.explanationMaxChars and
 * contains no figure that was not among the data given to the model.
 * Otherwise the fallback text, built from the score, is shown.
 */
export function aiTextProblems(
  text: string,
  input: { recommendedCompany: string; allowedNumbers: readonly string[]; maxChars: number },
): AiTextProblem[] {
  const out: AiTextProblem[] = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) return ["EMPTY"];
  if (trimmed.length > input.maxChars) out.push("TOO_LONG");
  if (!trimmed.toLowerCase().includes(input.recommendedCompany.toLowerCase())) {
    out.push("NO_RECOMMENDED_OFFER");
  }
  const normalize = (n: string) => n.replace(/\./g, "").replace(",", ".");
  const allowed = new Set(input.allowedNumbers.map(normalize));
  for (const n of trimmed.match(/\d[\d.,]*\d|\d/g) ?? []) {
    if (!allowed.has(normalize(n))) {
      out.push("FOREIGN_NUMBER");
      break;
    }
  }
  return out;
}

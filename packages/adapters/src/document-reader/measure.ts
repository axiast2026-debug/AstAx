import type { ExtractableDocument, ExtractedValue, ExtractionResult } from "./document-reader.js";
import { DOCUMENT_FIELDS } from "./fields.js";

/**
 * Phase 8, «Misura della lettura AI»: the reader's answers compared with the
 * right values (written by hand for the anonymous documents). For each field:
 * how many were above the confidence threshold, and how many of those were
 * right — the criterion is 95% right above the threshold; the fields below go
 * to the back office.
 */
export interface MeasuredCase {
  kind: ExtractableDocument;
  name: string;
  expected: Record<string, ExtractedValue>;
  result: ExtractionResult;
}

export interface FieldMeasure {
  kind: ExtractableDocument;
  field: string;
  cases: number;
  aboveThreshold: number;
  rightAboveThreshold: number;
  /** Below the threshold: the back office checks them. */
  toReview: number;
  /** Above the threshold but wrong: the dangerous ones. */
  wrongAboveThreshold: string[];
}

const normalize = (v: ExtractedValue): string | number | boolean | null =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").toUpperCase() : v;

export function sameValue(expected: ExtractedValue, actual: ExtractedValue): boolean {
  return normalize(expected) === normalize(actual);
}

export function measureReading(cases: readonly MeasuredCase[], threshold: number): FieldMeasure[] {
  const out = new Map<string, FieldMeasure>();
  for (const c of cases) {
    for (const spec of DOCUMENT_FIELDS[c.kind]) {
      if (!(spec.name in c.expected)) continue;
      const key = `${c.kind}.${spec.name}`;
      const m = out.get(key) ?? {
        kind: c.kind,
        field: spec.name,
        cases: 0,
        aboveThreshold: 0,
        rightAboveThreshold: 0,
        toReview: 0,
        wrongAboveThreshold: [],
      };
      const got = c.result.fields[spec.name] ?? { value: null, confidence: 0 };
      m.cases += 1;
      if (got.confidence >= threshold) {
        m.aboveThreshold += 1;
        if (sameValue(c.expected[spec.name] ?? null, got.value)) m.rightAboveThreshold += 1;
        else m.wrongAboveThreshold.push(c.name);
      } else {
        m.toReview += 1;
      }
      out.set(key, m);
    }
  }
  return [...out.values()];
}

/** The totals: share right above the threshold, and share sent to the back office. */
export function readingTotals(measures: readonly FieldMeasure[]) {
  const sum = (f: (m: FieldMeasure) => number) => measures.reduce((s, m) => s + f(m), 0);
  const above = sum((m) => m.aboveThreshold);
  const right = sum((m) => m.rightAboveThreshold);
  const all = sum((m) => m.cases);
  return {
    fields: all,
    aboveThreshold: above,
    rightShareAboveThreshold: above === 0 ? 0 : right / above,
    toReviewShare: all === 0 ? 0 : sum((m) => m.toReview) / all,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;

/** The report in Italian, for docs/collaudo/. Names of the cases only, no values (rule 8). */
export function readingReport(
  measures: readonly FieldMeasure[],
  info: { date: string; model: string; promptVersion: string; threshold: number; cases: number },
): string {
  const t = readingTotals(measures);
  const lines = [
    `# Misura della lettura AI — ${info.date}`,
    "",
    `Modello \`${info.model}\`, prompt \`${info.promptVersion}\`, soglia di confidenza ${String(info.threshold).replace(".", ",")}, ${info.cases} documenti.`,
    "",
    `**Corretti sopra soglia: ${pct(t.rightShareAboveThreshold)}** (criterio: almeno 95%). Campi al back office: ${pct(t.toReviewShare)}.`,
    "",
    "| Documento | Campo | Casi | Sopra soglia | Corretti sopra soglia | Al back office | Sbagliati sopra soglia |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...measures.map(
      (m) =>
        `| ${m.kind} | ${m.field} | ${m.cases} | ${m.aboveThreshold} | ${m.aboveThreshold === 0 ? "—" : pct(m.rightAboveThreshold / m.aboveThreshold)} | ${m.toReview} | ${m.wrongAboveThreshold.join(", ") || "—"} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

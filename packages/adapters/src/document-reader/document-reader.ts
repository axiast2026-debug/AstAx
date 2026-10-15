import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Clock } from "../clock/clock.js";
import type { PlateLookupPort } from "../vehicle-data/plate-lookup.js";

/**
 * Automatic reading of documents (docs/adattatori.md; real reader Claude on
 * Amazon Bedrock, EU inference profile, phase 8). Each field has a confidence
 * from 0 to 1; below `documents.confidenceThreshold` the back office reviews it.
 */
export type ExtractableDocument =
  | "REGISTRATION_CERTIFICATE"
  | "DRIVING_LICENCE"
  | "RISK_CERTIFICATE"
  | "FISCAL_CODE_CARD"
  | "QUOTE_PDF";

export const EXTRACTABLE_DOCUMENTS: readonly ExtractableDocument[] = [
  "REGISTRATION_CERTIFICATE",
  "DRIVING_LICENCE",
  "RISK_CERTIFICATE",
  "FISCAL_CODE_CARD",
  "QUOTE_PDF",
];

export interface StoredFileRef {
  key: string;
  fileName: string;
  contentType: string;
}

export type ExtractedValue = string | number | boolean | null;

export interface ExtractionResult {
  kind: ExtractableDocument;
  fields: Record<string, { value: ExtractedValue; confidence: number }>;
  warnings: string[];
  model: string;
  promptVersion: string;
}

export interface DocumentReaderPort {
  extract(input: { kind: ExtractableDocument; files: StoredFileRef[] }): Promise<ExtractionResult>;
}

export const FAKE_READER_MODEL = "fake-document-reader";
export const FAKE_PROMPT_VERSION = "fake-1";
export const LOW_CONFIDENCE_MARKER = "low-confidence";
const HIGH_CONFIDENCE = 0.97;
const LOW_CONFIDENCE = 0.6;

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "document-reader",
);

/** `@today+30` in a fixture is the date 30 days after the clock's today. */
function resolveValue(value: ExtractedValue, clock: Clock): ExtractedValue {
  if (typeof value !== "string") return value;
  const match = /^@today([+-]\d+)$/.exec(value);
  if (!match) return value;
  const date = new Date(clock.now().getTime() + Number(match[1]) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * The fixture is chosen by file name: `libretto-giulia-neri.jpg` uses
 * `fixtures/document-reader/REGISTRATION_CERTIFICATE/giulia-neri.json` when it
 * exists (the longest fixture name contained in the file name wins), else
 * `default.json`. A file name containing `low-confidence` gives every field
 * confidence 0.6. For a registration certificate the technical data come from
 * the plate lookup, so the two fakes agree.
 */
export class FakeDocumentReader implements DocumentReaderPort {
  constructor(
    private readonly clock: Clock,
    private readonly plateLookup?: PlateLookupPort,
    private readonly fixturesDir = FIXTURES_DIR,
  ) {}

  fixtureNames(kind: ExtractableDocument): string[] {
    const dir = join(this.fixturesDir, kind);
    const index = join(dir, "index.json");
    return existsSync(index) ? (JSON.parse(readFileSync(index, "utf8")) as string[]) : [];
  }

  private fixture(kind: ExtractableDocument, fileName: string): Record<string, ExtractedValue> {
    const lower = fileName.toLowerCase();
    const name =
      this.fixtureNames(kind)
        .filter((candidate) => lower.includes(candidate))
        .sort((a, b) => b.length - a.length)[0] ?? "default";
    return JSON.parse(readFileSync(join(this.fixturesDir, kind, `${name}.json`), "utf8")) as Record<
      string,
      ExtractedValue
    >;
  }

  async extract(input: {
    kind: ExtractableDocument;
    files: StoredFileRef[];
  }): Promise<ExtractionResult> {
    const first = input.files[0];
    if (!first)
      return {
        kind: input.kind,
        fields: {},
        warnings: ["NO_FILES"],
        model: FAKE_READER_MODEL,
        promptVersion: FAKE_PROMPT_VERSION,
      };
    const values = this.fixture(input.kind, first.fileName);
    if (
      input.kind === "REGISTRATION_CERTIFICATE" &&
      this.plateLookup &&
      typeof values.plate === "string"
    ) {
      const found = await this.plateLookup.lookup({ plate: values.plate });
      if (found.found) {
        const v = found.vehicle;
        Object.assign(values, {
          make: v.make,
          model: v.model,
          fuel: v.fuel ?? null,
          displacementCc: v.displacementCc ?? null,
          powerKw: v.powerKw ?? null,
          firstRegistrationDate: v.firstRegistrationDate ?? null,
        });
      }
    }
    const confidence = input.files.some((f) =>
      f.fileName.toLowerCase().includes(LOW_CONFIDENCE_MARKER),
    )
      ? LOW_CONFIDENCE
      : HIGH_CONFIDENCE;
    const fields: ExtractionResult["fields"] = {};
    for (const [key, value] of Object.entries(values)) {
      fields[key] = { value: resolveValue(value, this.clock), confidence };
    }
    return {
      kind: input.kind,
      fields,
      warnings: [],
      model: FAKE_READER_MODEL,
      promptVersion: FAKE_PROMPT_VERSION,
    };
  }
}

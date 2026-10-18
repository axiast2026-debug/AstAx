// pnpm --filter @astax/adapters measure:reading <folder> [--threshold 0.9] [--out file.md]
// Phase 8: reads the anonymous documents with the reader of the configuration
// (AI_PROVIDER=bedrock with BEDROCK_MODEL_ID and AWS credentials, otherwise the
// fake) and writes the report per field. The folder holds one subfolder per
// kind (REGISTRATION_CERTIFICATE, DRIVING_LICENCE, RISK_CERTIFICATE,
// FISCAL_CODE_CARD, QUOTE_PDF) and in it one subfolder per document, with its
// files (JPG, PNG or PDF) and expected.json, the right values written by hand.
// The documents never enter the repository: they stay where Dan keeps them.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { SystemClock } from "../clock/system-clock.js";
import { BedrockDocumentReader } from "../document-reader/bedrock-document-reader.js";
import {
  EXTRACTABLE_DOCUMENTS,
  FakeDocumentReader,
  type DocumentReaderPort,
  type ExtractedValue,
  type StoredFileRef,
} from "../document-reader/document-reader.js";
import { measureReading, readingReport, type MeasuredCase } from "../document-reader/measure.js";

const args = process.argv.slice(2);
const root = args[0];
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!root || !existsSync(root)) {
  console.error("usage: measure-reading <folder> [--threshold 0.9] [--out report.md]");
  process.exit(2);
}
const threshold = Number(option("threshold") ?? "0.9");
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

const load = async (key: string) => new Uint8Array(readFileSync(key));
const reader: DocumentReaderPort =
  process.env.AI_PROVIDER === "bedrock" && process.env.BEDROCK_MODEL_ID
    ? new BedrockDocumentReader(
        { region: process.env.AWS_REGION ?? "eu-south-1", modelId: process.env.BEDROCK_MODEL_ID },
        load,
      )
    : new FakeDocumentReader(new SystemClock(), undefined, undefined, load);

const cases: MeasuredCase[] = [];
let model = "";
let promptVersion = "";
for (const kind of EXTRACTABLE_DOCUMENTS) {
  const dir = join(root, kind);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    const folder = join(dir, name);
    const expectedFile = join(folder, "expected.json");
    if (!existsSync(expectedFile)) continue;
    const files: StoredFileRef[] = readdirSync(folder)
      .filter((f) => TYPES[extname(f).toLowerCase()])
      .sort()
      .map((f) => ({
        key: join(folder, f),
        fileName: f,
        contentType: TYPES[extname(f).toLowerCase()] ?? "",
      }));
    const result = await reader.extract({ kind, files });
    model = result.model;
    promptVersion = result.promptVersion;
    cases.push({
      kind,
      name,
      expected: JSON.parse(readFileSync(expectedFile, "utf8")) as Record<string, ExtractedValue>,
      result,
    });
    console.log(`${kind}/${name}: read`);
  }
}

const date = new SystemClock().now().toISOString().slice(0, 10);
const report = readingReport(measureReading(cases, threshold), {
  date,
  model,
  promptVersion,
  threshold,
  cases: cases.length,
});
const out = option("out");
if (out) writeFileSync(out, report);
else process.stdout.write(report);

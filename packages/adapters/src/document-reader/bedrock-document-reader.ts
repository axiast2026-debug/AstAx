import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  DocumentReaderPort,
  ExtractableDocument,
  ExtractedValue,
  ExtractionResult,
  StoredFileRef,
} from "./document-reader.js";
import { DOCUMENT_FIELDS, type FieldSpec } from "./fields.js";

export const READER_PROMPT_VERSION = "document-reader/v1";

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts");

/** A prompt file without its first comment line (the version note). */
export function loadPrompt(path: string): string {
  return readFileSync(join(PROMPTS_DIR, `${path}.md`), "utf8")
    .replace(/^<!--.*?-->\s*/s, "")
    .trim();
}

/** The part of the Bedrock client the adapters use (tests pass a fake one). */
export interface ConverseClient {
  send(command: ConverseCommand): Promise<ConverseCommandOutput>;
}

export interface BedrockOptions {
  /** The EU cross-region inference profile of Claude (e.g. eu.anthropic.…). */
  modelId: string;
  region: string;
  client?: ConverseClient;
}

const IMAGE_FORMATS: Record<string, "jpeg" | "png" | "webp" | "gif"> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function fieldSchema(spec: FieldSpec) {
  const value =
    spec.type === "integer"
      ? { type: ["integer", "null"] }
      : spec.type === "date"
        ? { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
        : { type: ["string", "null"], maxLength: 200 };
  return {
    type: "object",
    description: spec.description,
    properties: { value, confidence: { type: "number", minimum: 0, maximum: 1 } },
    required: ["value", "confidence"],
  };
}

/** The JSON schema of `record_fields` for one kind of document. */
export function extractionSchema(kind: ExtractableDocument) {
  const specs = DOCUMENT_FIELDS[kind];
  return {
    type: "object",
    properties: {
      fields: {
        type: "object",
        properties: Object.fromEntries(specs.map((s) => [s.name, fieldSchema(s)])),
        required: specs.map((s) => s.name),
      },
      warnings: {
        type: "array",
        items: { type: "string", enum: ["WRONG_DOCUMENT", "UNREADABLE"] },
      },
    },
    required: ["fields", "warnings"],
  };
}

/**
 * The answer of the model, checked: only the expected fields, the right types,
 * confidence between 0 and 1. A value of the wrong type becomes null with
 * confidence 0, so the back office sees it (never a guess passed as read).
 */
export function checkedExtraction(
  kind: ExtractableDocument,
  raw: unknown,
): Pick<ExtractionResult, "fields" | "warnings"> {
  const input = (raw ?? {}) as { fields?: Record<string, unknown>; warnings?: unknown };
  const fields: ExtractionResult["fields"] = {};
  for (const spec of DOCUMENT_FIELDS[kind]) {
    const got = (input.fields?.[spec.name] ?? {}) as { value?: unknown; confidence?: unknown };
    const confidence =
      typeof got.confidence === "number" && Number.isFinite(got.confidence)
        ? Math.min(1, Math.max(0, got.confidence))
        : 0;
    let value: ExtractedValue = null;
    if (spec.type === "integer" && Number.isInteger(got.value)) value = got.value as number;
    if (
      spec.type === "date" &&
      typeof got.value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(got.value)
    )
      value = got.value;
    if (spec.type === "string" && typeof got.value === "string" && got.value.length <= 200)
      value = got.value.trim();
    fields[spec.name] = { value, confidence: value === null ? 0 : confidence };
  }
  const warnings = Array.isArray(input.warnings)
    ? input.warnings.filter((w): w is string => w === "WRONG_DOCUMENT" || w === "UNREADABLE")
    : [];
  return { fields, warnings };
}

/**
 * Phase 8: Claude on Amazon Bedrock reads the documents (EU inference profile;
 * AWS does not use the data for training). The files go as images or PDF, the
 * answer comes through a tool with a fixed schema; the prompt is a versioned
 * file whose version is saved with the result. Errors carry no content.
 */
export class BedrockDocumentReader implements DocumentReaderPort {
  readonly #client: ConverseClient;
  readonly #prompt = loadPrompt("document-reader/v1");

  constructor(
    private readonly options: BedrockOptions,
    private readonly load: (key: string) => Promise<Uint8Array>,
  ) {
    this.#client = options.client ?? new BedrockRuntimeClient({ region: options.region });
  }

  private async block(file: StoredFileRef, index: number): Promise<ContentBlock> {
    const bytes = await this.load(file.key);
    if (file.contentType === "application/pdf") {
      return { document: { format: "pdf", name: `documento-${index + 1}`, source: { bytes } } };
    }
    const format = IMAGE_FORMATS[file.contentType];
    if (!format) throw new Error(`Unsupported content type ${file.contentType}`);
    return { image: { format, source: { bytes } } };
  }

  async extract(input: {
    kind: ExtractableDocument;
    files: StoredFileRef[];
  }): Promise<ExtractionResult> {
    const base = {
      kind: input.kind,
      model: this.options.modelId,
      promptVersion: READER_PROMPT_VERSION,
    };
    if (input.files.length === 0) return { ...base, fields: {}, warnings: ["NO_FILES"] };
    const content: ContentBlock[] = [];
    for (const [i, file] of input.files.entries()) content.push(await this.block(file, i));
    content.push({
      text: `Tipo di documento atteso: ${input.kind}. Restituisci i campi con record_fields.`,
    });
    const request: ConverseCommandInput = {
      modelId: this.options.modelId,
      system: [{ text: this.#prompt }],
      messages: [{ role: "user", content }],
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: "record_fields",
              description: "Registra i campi letti nel documento, con la confidenza di ciascuno.",
              inputSchema: { json: extractionSchema(input.kind) as never },
            },
          },
        ],
        toolChoice: { tool: { name: "record_fields" } },
      },
      inferenceConfig: { maxTokens: 2000, temperature: 0 },
    };
    const response = await this.#client.send(new ConverseCommand(request));
    const tool = response.output?.message?.content?.find((c) => c.toolUse)?.toolUse;
    if (!tool) return { ...base, fields: {}, warnings: ["NO_ANSWER"] };
    return { ...base, ...checkedExtraction(input.kind, tool.input) };
  }
}

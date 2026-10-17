import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { Clock } from "../clock/clock.js";
import type { ObjectStoragePort } from "../storage/object-storage.js";

/**
 * Advanced electronic signature with OTP (docs/adattatori.md; real provider
 * Namirial in phase 8). The documents are files of the object storage; the
 * provider returns the signed files and an evidence file.
 */
export interface SignatureDocument {
  id: string;
  title: string;
  key: string;
}

export interface SignatureEvent {
  eventId: string;
  providerRef: string;
  status: "SIGNED" | "REJECTED" | "EXPIRED";
  /** Storage keys of the signed files, in the order of the documents. */
  signedFileKeys: string[];
  evidenceFileKey: string | null;
}

export interface SignaturePort {
  readonly provider: string;
  createEnvelope(input: {
    reference: string;
    signer: { firstName: string; lastName: string };
    documents: SignatureDocument[];
    returnUrl: string;
  }): Promise<{ providerRef: string; signingUrl: string }>;
  /** The webhook, after checking that the provider signed it. */
  parseWebhook(headers: Record<string, string | undefined>, body: string): SignatureEvent;
}

export class InvalidWebhookError extends Error {
  constructor() {
    super("The webhook is not signed by the provider");
  }
}

/** HMAC of a webhook body, as the providers sign theirs. */
export function webhookSignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhook(secret: string, body: string, signature: string | undefined): void {
  const expected = Buffer.from(webhookSignature(secret, body), "hex");
  const given = Buffer.from(signature ?? "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new InvalidWebhookError();
  }
}

export const FAKE_SIGNATURE_CODE = "123456";
export const FAKE_SIGNATURE_PROVIDER = "fake-signature";
const SIGNATURE_HEADER = "x-fake-signature";

interface FakeEnvelope {
  reference: string;
  signer: { firstName: string; lastName: string };
  documents: SignatureDocument[];
  returnUrl: string;
  createdAt: string;
}

/**
 * Proposal A of phase 5: an internal page asks the code (always 123456 here),
 * then the signed files are the documents with a signature page, and the
 * evidence is a PDF with date, time and the operation's code. The envelope
 * lives in the object storage, so a restart loses nothing. The webhook is
 * signed with a development key and checked as a real one would be.
 */
export class FakeSignatureProvider implements SignaturePort {
  readonly provider = FAKE_SIGNATURE_PROVIDER;

  constructor(
    private readonly storage: ObjectStoragePort,
    private readonly clock: Clock,
    private readonly secret: string,
    private readonly pageUrl: (providerRef: string) => string,
  ) {}

  private key(providerRef: string) {
    return `fake-signature/${providerRef}.json`;
  }

  async createEnvelope(input: {
    reference: string;
    signer: { firstName: string; lastName: string };
    documents: SignatureDocument[];
    returnUrl: string;
  }) {
    const providerRef = `sig-${randomUUID()}`;
    const envelope: FakeEnvelope = { ...input, createdAt: this.clock.now().toISOString() };
    await this.storage.put({
      key: this.key(providerRef),
      body: new TextEncoder().encode(JSON.stringify(envelope)),
      contentType: "application/json",
    });
    return { providerRef, signingUrl: this.pageUrl(providerRef) };
  }

  /** What the signing page shows: the titles of the documents. */
  async envelope(providerRef: string): Promise<{ titles: string[]; returnUrl: string }> {
    const e = JSON.parse(
      new TextDecoder().decode(await this.storage.get(this.key(providerRef))),
    ) as FakeEnvelope;
    return { titles: e.documents.map((d) => d.title), returnUrl: e.returnUrl };
  }

  /**
   * The signer types the code. A right code signs: the webhook the provider
   * would send is returned, signed; a wrong one returns null.
   */
  async sign(
    providerRef: string,
    code: string,
  ): Promise<{ body: string; headers: Record<string, string> } | null> {
    if (code !== FAKE_SIGNATURE_CODE) return null;
    const e = JSON.parse(
      new TextDecoder().decode(await this.storage.get(this.key(providerRef))),
    ) as FakeEnvelope;
    const at = this.clock.now();
    const signer = `${e.signer.firstName} ${e.signer.lastName}`;
    const signedFileKeys: string[] = [];
    for (const doc of e.documents) {
      const pdf = await loadOrBlank(await this.storage.get(doc.key));
      const page = pdf.addPage([595, 842]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(`${doc.title} - firmato da ${signer}`, { x: 40, y: 780, size: 12, font });
      page.drawText(`${at.toISOString()} - firma di prova (${providerRef})`, {
        x: 40,
        y: 760,
        size: 10,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      const key = `fake-signature/${providerRef}/${doc.id}.pdf`;
      await this.storage.put({ key, body: await pdf.save(), contentType: "application/pdf" });
      signedFileKeys.push(key);
    }
    const evidence = await PDFDocument.create();
    const page = evidence.addPage([595, 842]);
    const font = await evidence.embedFont(StandardFonts.Helvetica);
    [
      "Evidenze della firma (prova)",
      `Operazione: ${providerRef}`,
      `Firmatario: ${signer}`,
      `Data e ora: ${at.toISOString()}`,
      `Documenti: ${e.documents.map((d) => d.title).join(", ")}`,
    ].forEach((line, i) => page.drawText(line, { x: 40, y: 780 - i * 20, size: 11, font }));
    const evidenceFileKey = `fake-signature/${providerRef}/evidence.pdf`;
    await this.storage.put({
      key: evidenceFileKey,
      body: await evidence.save(),
      contentType: "application/pdf",
    });
    const event: SignatureEvent = {
      eventId: `${providerRef}-signed`,
      providerRef,
      status: "SIGNED",
      signedFileKeys,
      evidenceFileKey,
    };
    const body = JSON.stringify(event);
    return { body, headers: { [SIGNATURE_HEADER]: webhookSignature(this.secret, body) } };
  }

  parseWebhook(headers: Record<string, string | undefined>, body: string): SignatureEvent {
    verifyWebhook(this.secret, body, headers[SIGNATURE_HEADER]);
    return JSON.parse(body) as SignatureEvent;
  }
}

async function loadOrBlank(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    return PDFDocument.create();
  }
}

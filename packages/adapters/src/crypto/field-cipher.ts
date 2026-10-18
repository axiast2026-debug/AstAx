import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Field encryption and blind index for fiscal code, VAT number, phone, email
 * and IBAN (SIC-03). Encrypted values go in `...Enc` columns, blind indexes in
 * `...Hash` columns for exact search.
 */
export interface FieldCipher {
  encrypt(plain: string): string;
  decrypt(encrypted: string): string;
  /** Deterministic keyed hash of the normalized value: same input, same index. */
  blindIndex(kind: BlindIndexKind, plain: string): string;
}

export type BlindIndexKind = "email" | "phone" | "fiscalCode" | "vatNumber" | "iban";

const NORMALIZERS: Record<BlindIndexKind, (value: string) => string> = {
  email: (v) => v.trim().toLowerCase(),
  phone: (v) => {
    const digits = v.replace(/[^\d+]/g, "").replace(/^00/, "+");
    return digits.startsWith("+") ? digits : `+39${digits}`;
  },
  fiscalCode: (v) => v.replace(/\s/g, "").toUpperCase(),
  vatNumber: (v) => v.replace(/\s/g, "").replace(/^IT/i, ""),
  iban: (v) => v.replace(/\s/g, "").toUpperCase(),
};

export function normalizeForIndex(kind: BlindIndexKind, value: string): string {
  return NORMALIZERS[kind](value);
}

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function parseKey(hex: string, name: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error(`${name} must be 32 bytes in hex`);
  return Buffer.from(hex, "hex");
}

/**
 * Local implementation: AES-256-GCM with a key from the environment, used in
 * development and tests. In production the key comes from KMS (phase 8).
 */
export class LocalFieldCipher implements FieldCipher {
  readonly #encryptionKey: Buffer;
  readonly #indexKey: Buffer;

  constructor(encryptionKeyHex: string, blindIndexKeyHex: string) {
    this.#encryptionKey = parseKey(encryptionKeyHex, "FIELD_ENCRYPTION_KEY");
    this.#indexKey = parseKey(blindIndexKeyHex, "BLIND_INDEX_KEY");
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.#encryptionKey, iv, {
      authTagLength: TAG_BYTES,
    });
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
  }

  decrypt(encrypted: string): string {
    const [version, payload] = encrypted.split(":", 2);
    if (version !== VERSION || payload === undefined)
      throw new Error("Unknown field encryption format");
    const raw = Buffer.from(payload, "base64");
    // The tag length is fixed: a shorter forged tag is refused (ASVS V6.2, Semgrep gcm-no-tag-length).
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#encryptionKey,
      raw.subarray(0, IV_BYTES),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  }

  blindIndex(kind: BlindIndexKind, plain: string): string {
    return createHmac("sha256", this.#indexKey)
      .update(`${kind}:${normalizeForIndex(kind, plain)}`)
      .digest("hex");
  }
}

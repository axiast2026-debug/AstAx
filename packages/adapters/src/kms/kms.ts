import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Key management (docs/busta-chiusa.md, ADR 0005). The port has the shape of
 * AWS KMS: a key id, the data, and an encryption context that must be given
 * again, identical, to decrypt. A process holds only the keys of its role.
 */
export const KMS_KEYS = {
  /** Wraps the private key of each auction; only the worker holds it (BC-03). */
  sealedBids: "astax-sealed-bids",
  /** The agency's own copy of its offer (BC-04); only the API holds it. */
  offerOwner: "astax-offer-owner",
} as const;
export type KmsKeyId = (typeof KMS_KEYS)[keyof typeof KMS_KEYS];

/** Identifiers only (rule 8): `purpose` plus the ids the use is bound to. */
export type KmsContext = Readonly<Record<string, string>>;

export interface KmsOperation {
  keyId: KmsKeyId;
  operation: "ENCRYPT" | "DECRYPT";
  context: KmsContext;
  ok: boolean;
}

export interface KmsPort {
  encrypt(keyId: KmsKeyId, plaintext: Uint8Array, context: KmsContext): Promise<string>;
  decrypt(keyId: KmsKeyId, ciphertext: string, context: KmsContext): Promise<Uint8Array>;
}

export class KmsAccessDenied extends Error {
  constructor(readonly keyId: string) {
    super(`This process has no access to the key ${keyId}`);
    this.name = "KmsAccessDenied";
  }
}

export class KmsDecryptFailed extends Error {
  constructor(readonly keyId: string) {
    super(`Decryption with ${keyId} failed: wrong context or altered value`);
    this.name = "KmsDecryptFailed";
  }
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The context as authenticated data: same keys and values, any order. */
function contextBytes(context: KmsContext): Buffer {
  const sorted = Object.keys(context)
    .sort()
    .map((k) => [k, context[k]]);
  return Buffer.from(JSON.stringify(sorted), "utf8");
}

/**
 * Fake KMS for development and tests: AES-256-GCM with local master keys,
 * the context as additional authenticated data. Every operation goes to
 * `onOperation` (the worker writes it to `KmsEvent`, the stand-in for
 * CloudTrail), failures included.
 */
export class LocalKms implements KmsPort {
  readonly #keys: Map<KmsKeyId, Buffer>;
  readonly #onOperation: (op: KmsOperation) => Promise<void> | void;

  constructor(
    keys: Partial<Record<KmsKeyId, string>>,
    onOperation: (op: KmsOperation) => Promise<void> | void = () => undefined,
  ) {
    this.#keys = new Map();
    for (const [id, hex] of Object.entries(keys) as [KmsKeyId, string | undefined][]) {
      if (hex === undefined) continue;
      if (!/^[0-9a-f]{64}$/i.test(hex))
        throw new Error(`The master key of ${id} must be 32 bytes in hex`);
      this.#keys.set(id, Buffer.from(hex, "hex"));
    }
    this.#onOperation = onOperation;
  }

  /** The key ids this process may use. */
  get keyIds(): KmsKeyId[] {
    return [...this.#keys.keys()];
  }

  #key(keyId: KmsKeyId): Buffer {
    const key = this.#keys.get(keyId);
    if (!key) throw new KmsAccessDenied(keyId);
    return key;
  }

  async encrypt(keyId: KmsKeyId, plaintext: Uint8Array, context: KmsContext): Promise<string> {
    let ok = false;
    try {
      const key = this.#key(keyId);
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(contextBytes(context));
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      ok = true;
      return `v1:kms:${keyId}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
    } finally {
      await this.#onOperation({ keyId, operation: "ENCRYPT", context, ok });
    }
  }

  async decrypt(keyId: KmsKeyId, ciphertext: string, context: KmsContext): Promise<Uint8Array> {
    let ok = false;
    try {
      const key = this.#key(keyId);
      const prefix = `v1:kms:${keyId}:`;
      if (!ciphertext.startsWith(prefix)) throw new KmsDecryptFailed(keyId);
      const raw = Buffer.from(ciphertext.slice(prefix.length), "base64");
      // The tag length is fixed: a shorter forged tag is refused (ASVS V6.2).
      const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES), {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(contextBytes(context));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      let plain: Buffer;
      try {
        plain = Buffer.concat([
          decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
          decipher.final(),
        ]);
      } catch {
        throw new KmsDecryptFailed(keyId);
      }
      ok = true;
      return new Uint8Array(plain);
    } finally {
      await this.#onOperation({ keyId, operation: "DECRYPT", context, ok });
    }
  }
}

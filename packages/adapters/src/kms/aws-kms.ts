import {
  DecryptCommand,
  EncryptCommand,
  KMSClient,
  type DecryptCommandOutput,
  type EncryptCommandOutput,
} from "@aws-sdk/client-kms";
import {
  KmsAccessDenied,
  KmsDecryptFailed,
  type KmsContext,
  type KmsKeyId,
  type KmsOperation,
  type KmsPort,
} from "./kms.js";

export interface AwsKmsOptions {
  region: string;
  /** The AWS key (ARN or alias) of each AstAx key this process may use. */
  keys: Partial<Record<KmsKeyId, string>>;
  client?: {
    send(
      command: EncryptCommand | DecryptCommand,
    ): Promise<EncryptCommandOutput | DecryptCommandOutput>;
  };
  onOperation?: (op: KmsOperation) => Promise<void> | void;
}

/**
 * Phase 8 (docs/busta-chiusa.md): AWS KMS. The encryption context is the same
 * as with the local KMS and is checked by AWS at decryption; CloudTrail logs
 * every use. A process is given only the keys of its role (the API never the
 * sealed bids' key): IAM refuses the others, here as KmsAccessDenied.
 */
export class AwsKms implements KmsPort {
  readonly #client: NonNullable<AwsKmsOptions["client"]>;

  constructor(private readonly options: AwsKmsOptions) {
    this.#client =
      options.client ??
      new KMSClient({
        region: options.region,
        requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000 },
      });
  }

  #key(keyId: KmsKeyId): string {
    const key = this.options.keys[keyId];
    if (!key) throw new KmsAccessDenied(keyId);
    return key;
  }

  async encrypt(keyId: KmsKeyId, plaintext: Uint8Array, context: KmsContext): Promise<string> {
    let ok = false;
    try {
      const out = (await this.#client
        .send(
          new EncryptCommand({
            KeyId: this.#key(keyId),
            Plaintext: plaintext,
            EncryptionContext: { ...context },
          }),
        )
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === "AccessDeniedException") {
            throw new KmsAccessDenied(keyId);
          }
          throw error;
        })) as EncryptCommandOutput;
      if (!out.CiphertextBlob) throw new Error("KMS returned no ciphertext");
      ok = true;
      return `v1:awskms:${keyId}:${Buffer.from(out.CiphertextBlob).toString("base64")}`;
    } finally {
      await this.options.onOperation?.({ keyId, operation: "ENCRYPT", context, ok });
    }
  }

  async decrypt(keyId: KmsKeyId, ciphertext: string, context: KmsContext): Promise<Uint8Array> {
    let ok = false;
    try {
      const prefix = `v1:awskms:${keyId}:`;
      if (!ciphertext.startsWith(prefix)) throw new KmsDecryptFailed(keyId);
      const out = (await this.#client
        .send(
          new DecryptCommand({
            KeyId: this.#key(keyId),
            CiphertextBlob: Buffer.from(ciphertext.slice(prefix.length), "base64"),
            EncryptionContext: { ...context },
          }),
        )
        .catch((error: unknown) => {
          const name = (error as { name?: string }).name;
          if (name === "AccessDeniedException") throw new KmsAccessDenied(keyId);
          if (name === "InvalidCiphertextException" || name === "IncorrectKeyException") {
            throw new KmsDecryptFailed(keyId);
          }
          throw error;
        })) as DecryptCommandOutput;
      if (!out.Plaintext) throw new KmsDecryptFailed(keyId);
      ok = true;
      return new Uint8Array(out.Plaintext);
    } finally {
      await this.options.onOperation?.({ keyId, operation: "DECRYPT", context, ok });
    }
  }
}

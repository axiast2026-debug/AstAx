import type { DecryptCommand, EncryptCommand } from "@aws-sdk/client-kms";
import { describe } from "vitest";
import { AwsKms } from "../kms/aws-kms.js";
import { KMS_KEYS, LocalKms } from "../kms/kms.js";
import { kmsContract } from "./kms.contract.js";

/**
 * A stand-in for AWS KMS: keeps plaintext and context behind an opaque blob,
 * refuses another context (InvalidCiphertextException) and keys not granted
 * (AccessDeniedException), as AWS does.
 */
function simulatedAws(granted: string[]) {
  const store = new Map<string, { plain: Uint8Array; context: string; key: string }>();
  const fail = (name: string) => Object.assign(new Error(name), { name });
  return {
    async send(command: EncryptCommand | DecryptCommand) {
      const input = command.input as {
        KeyId?: string;
        Plaintext?: Uint8Array;
        CiphertextBlob?: Uint8Array;
        EncryptionContext?: Record<string, string>;
      };
      if (!input.KeyId || !granted.includes(input.KeyId)) throw fail("AccessDeniedException");
      const context = JSON.stringify(Object.entries(input.EncryptionContext ?? {}).sort());
      if (input.Plaintext) {
        const id = String(store.size + 1);
        store.set(id, { plain: input.Plaintext, context, key: input.KeyId });
        return { CiphertextBlob: new TextEncoder().encode(id), $metadata: {} };
      }
      const entry = store.get(new TextDecoder().decode(input.CiphertextBlob));
      if (!entry || entry.context !== context || entry.key !== input.KeyId) {
        throw fail("InvalidCiphertextException");
      }
      return { Plaintext: entry.plain, $metadata: {} };
    },
  };
}

describe("KMS contract — local", () => {
  kmsContract(() => ({
    worker: new LocalKms({ [KMS_KEYS.sealedBids]: "5".repeat(64) }),
    api: new LocalKms({ [KMS_KEYS.offerOwner]: "6".repeat(64) }),
  }));
});

describe("KMS contract — AWS adapter, simulated AWS", () => {
  kmsContract(() => {
    const client = simulatedAws(["alias/sealed", "alias/owner"]);
    return {
      worker: new AwsKms({
        region: "eu-south-1",
        keys: { [KMS_KEYS.sealedBids]: "alias/sealed" },
        client,
      }),
      // The API's role has no grant on the sealed bids' key (IAM, phase 8).
      api: new AwsKms({
        region: "eu-south-1",
        keys: { [KMS_KEYS.offerOwner]: "alias/owner" },
        client,
      }),
    };
  });
});

const env = process.env;
describe.skipIf(!env.CONTRACT_KMS_SEALED_KEY || !env.CONTRACT_KMS_OWNER_KEY)(
  "KMS contract — AWS sandbox",
  () => {
    kmsContract(() => ({
      worker: new AwsKms({
        region: env.CONTRACT_AWS_REGION ?? "eu-south-1",
        keys: { [KMS_KEYS.sealedBids]: env.CONTRACT_KMS_SEALED_KEY },
      }),
      api: new AwsKms({
        region: env.CONTRACT_AWS_REGION ?? "eu-south-1",
        keys: { [KMS_KEYS.offerOwner]: env.CONTRACT_KMS_OWNER_KEY },
      }),
    }));
  },
);

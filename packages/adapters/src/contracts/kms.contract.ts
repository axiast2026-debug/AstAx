import { expect, it } from "vitest";
import { KMS_KEYS, KmsAccessDenied, KmsDecryptFailed, type KmsPort } from "../kms/kms.js";

const bytes = (s: string) => new TextEncoder().encode(s);

/** What every KMS must do (docs/busta-chiusa.md): same key and same context, or nothing. */
export function kmsContract(make: () => { worker: KmsPort; api: KmsPort }) {
  it("contract: round trip with the same context, in any order", async () => {
    const { worker } = make();
    const ctx = { purpose: "sealed-bid", auctionId: "contract-1" };
    const wrapped = await worker.encrypt(KMS_KEYS.sealedBids, bytes("chiave privata"), ctx);
    const plain = await worker.decrypt(KMS_KEYS.sealedBids, wrapped, {
      auctionId: "contract-1",
      purpose: "sealed-bid",
    });
    expect(new TextDecoder().decode(plain)).toBe("chiave privata");
  });

  it("contract: another context is refused", async () => {
    const { worker } = make();
    const wrapped = await worker.encrypt(KMS_KEYS.sealedBids, bytes("x"), { auctionId: "a" });
    await expect(
      worker.decrypt(KMS_KEYS.sealedBids, wrapped, { auctionId: "b" }),
    ).rejects.toBeInstanceOf(KmsDecryptFailed);
  });

  // What the adapter guarantees: a process configured without the sealed bids' key
  // cannot use it. That AWS refuses the API's role is proven by the Terraform
  // test (bc03_…) and, in collaudo, by the live IAM check (docs/go-live.md).
  it("contract: BC-03 a process without the sealed bids' key cannot use it", async () => {
    const { worker, api } = make();
    const wrapped = await worker.encrypt(KMS_KEYS.sealedBids, bytes("x"), { auctionId: "a" });
    await expect(
      api.decrypt(KMS_KEYS.sealedBids, wrapped, { auctionId: "a" }),
    ).rejects.toBeInstanceOf(KmsAccessDenied);
  });
}

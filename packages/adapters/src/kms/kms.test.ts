import { describe, expect, it } from "vitest";
import { KMS_KEYS, KmsAccessDenied, KmsDecryptFailed, LocalKms, type KmsOperation } from "./kms.js";
import {
  decryptFile,
  encryptFile,
  generateAuctionKeyPair,
  openSealed,
  seal,
  wipe,
} from "./sealed-box.js";

const SEALED_KEY = "5".repeat(64);
const OWNER_KEY = "6".repeat(64);
const text = (s: string) => new TextEncoder().encode(s);
const read = (b: Uint8Array) => new TextDecoder().decode(b);

describe("fake KMS (docs/busta-chiusa.md, ADR 0005)", () => {
  it("BC-03 decrypts only with the same key and the same context", async () => {
    const kms = new LocalKms({ [KMS_KEYS.sealedBids]: SEALED_KEY });
    const ctx = { purpose: "sealed-bid", auctionId: "a-1" };
    const wrapped = await kms.encrypt(KMS_KEYS.sealedBids, text("private"), ctx);
    expect(wrapped.startsWith("v1:kms:astax-sealed-bids:")).toBe(true);
    expect(
      read(
        await kms.decrypt(KMS_KEYS.sealedBids, wrapped, {
          auctionId: "a-1",
          purpose: "sealed-bid",
        }),
      ),
    ).toBe("private");
    await expect(
      kms.decrypt(KMS_KEYS.sealedBids, wrapped, { purpose: "sealed-bid", auctionId: "a-2" }),
    ).rejects.toBeInstanceOf(KmsDecryptFailed);
  });

  it("BC-03 the API process holds only the owner key: it cannot unwrap an auction key", async () => {
    const worker = new LocalKms({ [KMS_KEYS.sealedBids]: SEALED_KEY });
    const api = new LocalKms({ [KMS_KEYS.offerOwner]: OWNER_KEY });
    const ctx = { purpose: "sealed-bid", auctionId: "a-1" };
    const wrapped = await worker.encrypt(KMS_KEYS.sealedBids, text("private"), ctx);
    await expect(api.decrypt(KMS_KEYS.sealedBids, wrapped, ctx)).rejects.toBeInstanceOf(
      KmsAccessDenied,
    );
    expect(api.keyIds).toEqual([KMS_KEYS.offerOwner]);
  });

  it("records every operation, failures included, with the context and no data", async () => {
    const log: KmsOperation[] = [];
    const kms = new LocalKms({ [KMS_KEYS.sealedBids]: SEALED_KEY }, (op) => {
      log.push(op);
    });
    const ctx = { purpose: "sealed-bid", auctionId: "a-1" };
    const wrapped = await kms.encrypt(KMS_KEYS.sealedBids, text("private"), ctx);
    await kms.decrypt(KMS_KEYS.sealedBids, wrapped, ctx);
    await expect(kms.decrypt(KMS_KEYS.offerOwner, wrapped, ctx)).rejects.toThrow();
    expect(log).toEqual([
      { keyId: KMS_KEYS.sealedBids, operation: "ENCRYPT", context: ctx, ok: true },
      { keyId: KMS_KEYS.sealedBids, operation: "DECRYPT", context: ctx, ok: true },
      { keyId: KMS_KEYS.offerOwner, operation: "DECRYPT", context: ctx, ok: false },
    ]);
  });

  it("refuses a malformed master key", () => {
    expect(() => new LocalKms({ [KMS_KEYS.sealedBids]: "short" })).toThrow(/32 bytes/);
  });
});

describe("sealed box (BC-02)", () => {
  it("BC-02 what is sealed with the public key opens only with the private key of that auction", async () => {
    const auction = await generateAuctionKeyPair();
    const other = await generateAuctionKeyPair();
    const sealed = await seal(auction.publicKey, text('{"premium":50500}'));
    expect(sealed.startsWith("v1:sb:")).toBe(true);
    expect(sealed).not.toContain("50500");
    expect(read(await openSealed(auction.publicKey, auction.privateKey, sealed))).toBe(
      '{"premium":50500}',
    );
    await expect(openSealed(other.publicKey, other.privateKey, sealed)).rejects.toThrow();
  });

  it("BC-02 a file is encrypted with a random key, which can itself be sealed", async () => {
    const auction = await generateAuctionKeyPair();
    const pdf = text("%PDF-1.7 preventivo");
    const { key, encrypted } = await encryptFile(pdf);
    expect(Buffer.from(encrypted).toString("utf8")).not.toContain("preventivo");
    const sealedKey = await seal(auction.publicKey, key);
    const opened = await openSealed(auction.publicKey, auction.privateKey, sealedKey);
    expect(read(await decryptFile(opened, encrypted))).toBe("%PDF-1.7 preventivo");
  });

  it("wipes a key from memory", async () => {
    const { privateKey } = await generateAuctionKeyPair();
    await wipe(privateKey);
    expect(privateKey.every((b) => b === 0)).toBe(true);
  });
});

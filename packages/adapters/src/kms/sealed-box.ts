import sodium from "libsodium-wrappers";

/**
 * The sealed bid (docs/busta-chiusa.md, ADR 0005): one X25519 key pair per
 * auction round; the API seals with the public key and cannot open; the
 * worker opens at the closing with the private key unwrapped by the KMS.
 * Values are text with a version prefix.
 */

let ready: Promise<void> | null = null;
async function lib(): Promise<typeof sodium> {
  ready ??= sodium.ready;
  await ready;
  return sodium;
}

const SEALED = "v1:sb:";

export interface AuctionKeyPair {
  /** Base64, stored in clear on the auction. */
  publicKey: string;
  /** Raw bytes: to wrap with the KMS at once and then wipe. */
  privateKey: Uint8Array;
}

export async function generateAuctionKeyPair(): Promise<AuctionKeyPair> {
  const s = await lib();
  const pair = s.crypto_box_keypair();
  return { publicKey: s.to_base64(pair.publicKey), privateKey: pair.privateKey };
}

/** Seals bytes with the public key of the auction: only its private key opens them. */
export async function seal(publicKey: string, data: Uint8Array): Promise<string> {
  const s = await lib();
  return SEALED + s.to_base64(s.crypto_box_seal(data, s.from_base64(publicKey)));
}

export async function openSealed(
  publicKey: string,
  privateKey: Uint8Array,
  sealed: string,
): Promise<Uint8Array> {
  if (!sealed.startsWith(SEALED)) throw new Error("Not a sealed value");
  const s = await lib();
  return s.crypto_box_seal_open(
    s.from_base64(sealed.slice(SEALED.length)),
    s.from_base64(publicKey),
    privateKey,
  );
}

/** A random key and the file encrypted with it (XSalsa20-Poly1305): for the PDF of an offer. */
export async function encryptFile(
  data: Uint8Array,
): Promise<{ key: Uint8Array; encrypted: Uint8Array }> {
  const s = await lib();
  const key = s.crypto_secretbox_keygen();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const box = s.crypto_secretbox_easy(data, nonce, key);
  const encrypted = new Uint8Array(nonce.length + box.length);
  encrypted.set(nonce);
  encrypted.set(box, nonce.length);
  return { key, encrypted };
}

export async function decryptFile(key: Uint8Array, encrypted: Uint8Array): Promise<Uint8Array> {
  const s = await lib();
  const n = s.crypto_secretbox_NONCEBYTES;
  return s.crypto_secretbox_open_easy(encrypted.subarray(n), encrypted.subarray(0, n), key);
}

/** Overwrites a key in memory once it is no longer needed. */
export async function wipe(bytes: Uint8Array): Promise<void> {
  (await lib()).memzero(bytes);
}

export const SEALED_PREFIX = SEALED;

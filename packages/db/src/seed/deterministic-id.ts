import { createHash } from "node:crypto";

/**
 * UUID (version 7 layout) derived from a seed and a name: the synthetic data is
 * always the same for the same seed, so tests and demos can refer to it.
 */
export function deterministicUuid(seed: string, name: string): string {
  const bytes = createHash("sha256").update(`${seed}:${name}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

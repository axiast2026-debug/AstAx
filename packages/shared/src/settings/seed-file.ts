import { z } from "zod";
import { isSettingKey, parseSettingValue, SETTING_KEYS, type SettingKey } from "./registry.js";

const seedFileSchema = z.object({
  schemaVersion: z.literal(1),
  settings: z.array(
    z.object({
      key: z.string(),
      value: z.unknown(),
      description: z.string(),
      rule: z.string(),
    }),
  ),
});

export interface SeedSetting {
  key: SettingKey;
  value: unknown;
  description: string;
  rule: string;
}

/** Validates seed/parametri.json: every known key exactly once, every value valid. */
export function parseSeedSettings(raw: unknown): SeedSetting[] {
  const file = seedFileSchema.parse(raw);
  const seen = new Set<string>();
  const result: SeedSetting[] = [];
  for (const entry of file.settings) {
    if (!isSettingKey(entry.key)) throw new Error(`Unknown setting in seed: ${entry.key}`);
    if (seen.has(entry.key)) throw new Error(`Duplicated setting in seed: ${entry.key}`);
    seen.add(entry.key);
    result.push({ ...entry, key: entry.key, value: parseSettingValue(entry.key, entry.value) });
  }
  const missing = SETTING_KEYS.filter((key) => !seen.has(key));
  if (missing.length > 0) throw new Error(`Settings missing from seed: ${missing.join(", ")}`);
  return result;
}

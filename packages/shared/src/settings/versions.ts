import {
  parseSettingValue,
  type SettingKey,
  type SettingValue,
  type SettingValues,
  SETTING_KEYS,
} from "./registry.js";

/** One stored version of a parameter (entity `Setting`). Values are kept for ever. */
export interface SettingVersion<K extends SettingKey = SettingKey> {
  key: K;
  version: number;
  value: SettingValue<K>;
  validFrom: Date;
  changedBy: string | null;
  reason: string | null;
}

export class SettingNotFoundError extends Error {
  constructor(
    readonly key: string,
    readonly at: Date,
  ) {
    super(`No version of setting ${key} is valid at ${at.toISOString()}`);
    this.name = "SettingNotFoundError";
  }
}

export class InvalidSettingChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingChangeError";
  }
}

/** The version in force at `at`: the one with the latest `validFrom` not after `at`. */
export function resolveSettingAt<K extends SettingKey>(
  versions: readonly SettingVersion[],
  key: K,
  at: Date,
): SettingVersion<K> | undefined {
  let found: SettingVersion | undefined;
  for (const candidate of versions) {
    if (candidate.key !== key || candidate.validFrom.getTime() > at.getTime()) continue;
    if (
      !found ||
      candidate.validFrom.getTime() > found.validFrom.getTime() ||
      (candidate.validFrom.getTime() === found.validFrom.getTime() &&
        candidate.version > found.version)
    ) {
      found = candidate;
    }
  }
  return found as SettingVersion<K> | undefined;
}

export function requireSettingAt<K extends SettingKey>(
  versions: readonly SettingVersion[],
  key: K,
  at: Date,
): SettingValue<K> {
  const found = resolveSettingAt(versions, key, at);
  if (!found) throw new SettingNotFoundError(key, at);
  return found.value;
}

/** All parameters in force at `at`: what an auction saves when it opens (ASTA-09). */
export function snapshotSettingsAt(versions: readonly SettingVersion[], at: Date): SettingValues {
  const snapshot: Partial<Record<SettingKey, unknown>> = {};
  for (const key of SETTING_KEYS) snapshot[key] = requireSettingAt(versions, key, at);
  return snapshot as SettingValues;
}

export interface SettingChange<K extends SettingKey> {
  key: K;
  value: unknown;
  validFrom: Date;
  changedBy: string;
  reason: string;
}

/**
 * Builds the next version of a parameter. A change never overwrites:
 * it adds a version with author and reason (fase 1, passo 10).
 */
export function planSettingChange<K extends SettingKey>(
  current: SettingVersion<K> | undefined,
  change: SettingChange<K>,
): SettingVersion<K> {
  const reason = change.reason.trim();
  if (reason.length === 0) throw new InvalidSettingChangeError("A reason is required");
  if (change.changedBy.trim().length === 0)
    throw new InvalidSettingChangeError("An author is required");
  if (current && change.validFrom.getTime() <= current.validFrom.getTime()) {
    throw new InvalidSettingChangeError("validFrom must be later than the current version");
  }
  return {
    key: change.key,
    version: (current?.version ?? 0) + 1,
    value: parseSettingValue(change.key, change.value),
    validFrom: change.validFrom,
    changedBy: change.changedBy,
    reason,
  };
}

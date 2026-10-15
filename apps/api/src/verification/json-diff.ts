/**
 * Paths of the leaves that differ between two JSON values ("vehicle.make",
 * "drivers.0.licence.expiresOn"). Used to record which fields a back office
 * correction changed, without their values (ADR 0007).
 */
export function changedPaths(before: unknown, after: unknown, prefix = ""): string[] {
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    return Array.from({ length }, (_, i) =>
      changedPaths(before[i], after[i], join(prefix, String(i))),
    ).flat();
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => changedPaths(before[key], after[key], join(prefix, key)));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix];
}

function join(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

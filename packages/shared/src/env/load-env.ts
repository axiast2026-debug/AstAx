import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

const REFERENCE = /\$\{([A-Z0-9_]+)\}/gi;

/**
 * Expands ${NAME} references using the other values of the same file, in any
 * order, then the process environment. Unknown names stay empty, as in a shell;
 * a reference cycle is an error.
 */
export function expandEnv(
  values: Readonly<Record<string, string | undefined>>,
  base: Readonly<Record<string, string | undefined>> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  const resolving = new Set<string>();

  const resolve = (name: string): string => {
    const done = out[name];
    if (done !== undefined) return done;
    const raw = values[name];
    if (raw === undefined) return base[name] ?? "";
    if (resolving.has(name)) throw new Error(`Cyclic reference in .env: ${name}`);
    resolving.add(name);
    const value = raw.replace(REFERENCE, (_match, ref: string) => resolve(ref));
    resolving.delete(name);
    out[name] = value;
    return value;
  };

  for (const name of Object.keys(values)) resolve(name);
  return out;
}

/** Walks up from `startDir` to the folder containing pnpm-workspace.yaml. */
export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Repository root not found");
    dir = parent;
  }
}

/**
 * Loads the repository .env into process.env, without overriding variables that
 * are already set (CI and cloud set them directly). A missing file is not an error.
 */
export function loadEnv(startDir: string = process.cwd()): void {
  const file = join(findRepoRoot(startDir), ".env");
  if (!existsSync(file)) return;
  const expanded = expandEnv(parseEnv(readFileSync(file, "utf8")), process.env);
  for (const [key, value] of Object.entries(expanded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

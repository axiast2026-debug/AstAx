// Creates .env from .env.example, generating every __GENERATE__ value.
// Never overwrites an existing .env: delete it first to start over.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("../.env", import.meta.url);
if (existsSync(target)) {
  console.log(".env already exists: nothing to do.");
  process.exit(0);
}
const template = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const content = template.replace(/__GENERATE__/g, () => randomBytes(32).toString("hex"));
writeFileSync(target, content, { mode: 0o600 });
console.log(".env created with fresh random values.");

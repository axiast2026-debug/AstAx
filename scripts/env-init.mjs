// Creates .env from .env.example, generating every __GENERATE__ value.
// An existing .env is never overwritten: only the keys it lacks are added
// (phase 8: new settings such as the VAPID keys reach older checkouts).
import { createECDH, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";

const target = new URL("../.env", import.meta.url);
const template = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

// Web Push: one P-256 key pair, the public half as the browser expects it.
const vapid = createECDH("prime256v1");
vapid.generateKeys();
const fill = (text) =>
  text
    .replace(/__GENERATE_VAPID_PUBLIC__/g, vapid.getPublicKey("base64url"))
    .replace(/__GENERATE_VAPID_PRIVATE__/g, vapid.getPrivateKey("base64url"))
    .replace(/__GENERATE__/g, () => randomBytes(32).toString("hex"));

if (!existsSync(target)) {
  writeFileSync(target, fill(template), { mode: 0o600 });
  console.log(".env created with fresh random values.");
  process.exit(0);
}

const keyOf = (line) => /^([A-Z0-9_]+)=/.exec(line)?.[1];
const present = new Set(readFileSync(target, "utf8").split(/\r?\n/).map(keyOf).filter(Boolean));
const missing = template.split(/\r?\n/).filter((line) => {
  const key = keyOf(line);
  return key !== undefined && !present.has(key);
});
if (missing.length === 0) {
  console.log(".env already complete: nothing to do.");
} else {
  appendFileSync(target, `\n# Added by pnpm env:init\n${fill(missing.join("\n"))}\n`);
  console.log(`.env: added ${missing.length} missing settings (values not shown).`);
}

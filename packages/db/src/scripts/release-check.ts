// pnpm release:check — the gate of the production pipeline (phase 8). It runs
// with the production configuration in its environment and stops the release
// if DEV_TOOLS is on, a provider is fake or NODE_ENV is not production; then
// the legal texts in force must be validated (pnpm legal:check, LEG-03).
import { configurationBlockers } from "../release-gate.js";

const blockers = configurationBlockers(process.env);
if (blockers.length > 0) {
  console.error(`Release stopped (${blockers.length}):\n- ${blockers.join("\n- ")}`);
  process.exit(1);
}
console.log("Configuration ready for production; now the legal texts.");
await import("./legal-check.js");

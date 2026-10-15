// pnpm legal:check — fails if a legal text in force is not validated by the
// lawyer (LEG-03, CLAUDE.md rule 10). The production release runs it and stops.
import { SystemClock } from "@astax/adapters/clock";
import { loadEnv } from "@astax/shared/env";
import { createDbClient } from "../client.js";
import { SYSTEM_CONTEXT, withContext } from "../context.js";
import { LEGAL_PLACEHOLDER_MARK } from "../seed/legal-placeholders.js";

loadEnv(import.meta.dirname);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set: run pnpm env:init");
  process.exit(2);
}

const db = createDbClient(url);
try {
  const now = new SystemClock().now();
  const documents = await withContext(db, SYSTEM_CONTEXT, (tx) =>
    tx.legalDocument.findMany({
      orderBy: { key: "asc" },
      include: {
        versions: { where: { publishedAt: { lte: now } }, orderBy: { number: "desc" }, take: 1 },
      },
    }),
  );
  const problems = documents.flatMap((doc) => {
    const current = doc.versions[0];
    if (!current) return [`${doc.key}: no version in force`];
    if (current.status !== "VALIDATED") return [`${doc.key} v${current.number}: not validated`];
    if (current.contentMd.includes(LEGAL_PLACEHOLDER_MARK))
      return [`${doc.key} v${current.number}: placeholder text`];
    return [];
  });
  if (problems.length > 0) {
    console.error(
      `Legal texts not ready for production (${problems.length}):\n- ${problems.join("\n- ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(`All ${documents.length} legal texts in force are validated.`);
  }
} finally {
  await db.$disconnect();
}

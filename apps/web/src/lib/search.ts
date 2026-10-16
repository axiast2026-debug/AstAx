import "server-only";
import { sessionId, webAuth } from "./auth";

/**
 * What a user searches for (a fiscal code, a plate) is personal data: it
 * never goes in a URL, where it would stay in the browser history and in the
 * server logs (CLAUDE.md rule 8). The search forms post it to a server
 * action, which keeps it for a few minutes on the server, next to the
 * session (Redis), where the page that follows reads it.
 */
export const SEARCH_SCOPES = ["clienti", "nuova-richiesta", "richieste"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export async function readSearch(scope: SearchScope): Promise<Record<string, string>> {
  return webAuth().search(await sessionId(), scope);
}

export async function writeSearch(
  scope: SearchScope,
  value: Record<string, string>,
): Promise<void> {
  await webAuth().setSearch(await sessionId(), scope, value);
}

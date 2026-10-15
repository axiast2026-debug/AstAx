import type { DbClient, DbTransaction } from "./client.js";

/**
 * Who is acting, as row level security sees it (SIC-02). Built by the API from
 * the token and the X-AstAx-Context membership; never from client input alone.
 */
export type DbContext =
  | { kind: "USER"; userId: string; organizationId: string | null; isStaff: boolean }
  /** Worker activities, seed and outbox dispatcher: not tied to a user. */
  | { kind: "SYSTEM" };

export const SYSTEM_CONTEXT: DbContext = { kind: "SYSTEM" };

/**
 * Runs `work` in one transaction whose first statement sets the context
 * variables read by the policies. `set_config(..., true)` lasts only for this
 * transaction, so a pooled connection never carries a previous user's context.
 */
export async function withContext<T>(
  db: DbClient,
  context: DbContext,
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const userId = context.kind === "USER" ? context.userId : "";
  const organizationId = context.kind === "USER" ? (context.organizationId ?? "") : "";
  const isStaff = context.kind === "USER" && context.isStaff ? "true" : "false";
  const isSystem = context.kind === "SYSTEM" ? "true" : "false";
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.user_id', ${userId}, true),
      set_config('app.organization_id', ${organizationId}, true),
      set_config('app.is_staff', ${isStaff}, true),
      set_config('app.is_system', ${isSystem}, true)`;
    return work(tx);
  });
}

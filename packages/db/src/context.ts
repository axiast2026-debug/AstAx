import type { DbClient, DbTransaction } from "./client.js";

/**
 * Who is acting, as row level security sees it (SIC-02). Built by the API from
 * the token and the X-AstAx-Context membership; never from client input alone.
 * `role` is the role of the active membership (null for privates), so the
 * policies can tell an administrator from the rest of the back office.
 */
export type DbContext =
  | {
      kind: "USER";
      userId: string;
      organizationId: string | null;
      isStaff: boolean;
      role: string | null;
    }
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
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const userId = context.kind === "USER" ? context.userId : "";
  const organizationId = context.kind === "USER" ? (context.organizationId ?? "") : "";
  const isStaff = context.kind === "USER" && context.isStaff ? "true" : "false";
  const role = context.kind === "USER" ? (context.role ?? "") : "";
  const isSystem = context.kind === "SYSTEM" ? "true" : "false";
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT
      set_config('app.user_id', ${userId}, true),
      set_config('app.organization_id', ${organizationId}, true),
      set_config('app.is_staff', ${isStaff}, true),
      set_config('app.role', ${role}, true),
      set_config('app.is_system', ${isSystem}, true)`;
      return work(tx);
    },
    { timeout: options.timeoutMs ?? 5_000 },
  );
}

/**
 * Runs one write that the caller's own context may not do, in the same
 * transaction: a notification for another user, a consent proven by a code.
 * Kept for the few places that have checked the right to do it; the context
 * goes back to the caller's even if `work` fails.
 *
 * Calls on the same transaction may overlap (several inside one
 * `Promise.all`): the setting is taken by the first and given back by the
 * last, so one that ends early never puts the caller's context back under
 * another still reading. The setting holds for the whole transaction, so a
 * query of the caller's own that overlaps a system call runs as system too:
 * never put `asSystem` and the caller's queries in the same `Promise.all`
 * (one `asSystem` around a `Promise.all` of system reads is fine).
 */
const systemDepth = new WeakMap<object, { depth: number; previous: string }>();

export async function asSystem<T>(tx: DbTransaction, work: () => Promise<T>): Promise<T> {
  let state = systemDepth.get(tx);
  if (!state) {
    state = { depth: 0, previous: "false" };
    systemDepth.set(tx, state);
  }
  state.depth += 1;
  try {
    if (state.depth === 1) {
      const [previous] = await tx.$queryRaw<{ value: string }[]>`
        SELECT coalesce(current_setting('app.is_system', true), 'false') AS value`;
      state.previous = previous?.value ?? "false";
      await tx.$executeRaw`SELECT set_config('app.is_system', 'true', true)`;
    } else {
      // A call that overlaps the first: the setting may still be on its way.
      await tx.$executeRaw`SELECT set_config('app.is_system', 'true', true)`;
    }
    return await work();
  } finally {
    state.depth -= 1;
    if (state.depth === 0) {
      await tx.$executeRaw`SELECT set_config('app.is_system', ${state.previous}, true)`;
    }
  }
}

import { createHash } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import { asSystem, settingsAt, withContext, type DbClient, type DbTransaction } from "@astax/db";
import {
  dailyBalance,
  matchStatement,
  parseStatement,
  StatementFormatError,
} from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB } from "../infra/tokens.js";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayOf = (day: string) => new Date(`${day}T00:00:00.000Z`);

/**
 * Spec 06 «Pagamenti», proposal C: the statement of the separate account is
 * imported (CSV or camt.053, never the same file twice), each credit matched
 * to a captured payment by request code and amount; what does not fit stays
 * in the queue, where accounting matches it by hand or ignores it with a
 * note. The daily balance compares credits and captured payments per day.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** The captured payments not matched yet, with their request code. */
  private async openPayments(tx: DbTransaction) {
    const payments = await asSystem(tx, () =>
      tx.payment.findMany({
        where: { status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
        include: { acceptance: { select: { quoteRequestId: true } } },
      }),
    );
    const taken = new Set(
      (
        await tx.bankStatementLine.findMany({
          where: { paymentId: { in: payments.map((p) => p.id) } },
          select: { paymentId: true },
        })
      ).map((l) => l.paymentId),
    );
    const open = payments.filter((p) => !taken.has(p.id));
    const requests = await asSystem(tx, () =>
      tx.quoteRequest.findMany({
        where: { id: { in: open.map((p) => p.acceptance.quoteRequestId) } },
        select: { id: true, code: true },
      }),
    );
    return open.map((p) => ({
      id: p.id,
      requestCode: requests.find((r) => r.id === p.acceptance.quoteRequestId)?.code ?? "",
      amountCents: p.premiumCents + p.feeCents,
      capturedAt: p.capturedAt,
    }));
  }

  async importStatement(auth: AuthContext, fileName: string, body: Uint8Array) {
    const now = this.clock.now();
    const text = new TextDecoder("utf-8").decode(body);
    let parsed: ReturnType<typeof parseStatement>;
    try {
      parsed = parseStatement(text);
    } catch (error) {
      if (error instanceof StatementFormatError) {
        throw new ProblemError("VALIDATION_FAILED", "Statement not readable", [
          { path: "file", issue: `STATEMENT_${error.issue}` },
        ]);
      }
      throw error;
    }
    const sha256 = createHash("sha256").update(body).digest("hex");
    return withContext(
      this.db,
      auth.db,
      async (tx) => {
        if (await tx.bankStatement.findUnique({ where: { sha256 } })) {
          throw new ProblemError("CONFLICT", "Already imported", [
            { path: "file", issue: "ALREADY_IMPORTED" },
          ]);
        }
        // A line already imported from another file (same bank reference) is skipped.
        const references = parsed.lines.flatMap((l) => (l.reference ? [l.reference] : []));
        const known = new Set(
          (
            await tx.bankStatementLine.findMany({
              where: { reference: { in: references } },
              select: { reference: true },
            })
          ).map((l) => l.reference),
        );
        const fresh = parsed.lines.filter((l) => !l.reference || !known.has(l.reference));
        const statement = await tx.bankStatement.create({
          data: {
            format: parsed.format,
            fileName: fileName.slice(0, 200),
            sha256,
            lineCount: fresh.length,
            importedByUserId: auth.userId,
            importedAt: now,
          },
        });
        const created = [];
        for (const l of fresh) {
          created.push(
            await tx.bankStatementLine.create({
              data: {
                statementId: statement.id,
                bookingDate: dayOf(l.bookingDate),
                valueDate: l.valueDate ? dayOf(l.valueDate) : null,
                amountCents: l.amountCents,
                currency: l.currency,
                counterparty: l.counterparty,
                description: l.description,
                reference: l.reference,
              },
            }),
          );
        }
        const { "requests.codePrefix": prefix } = await settingsAt(
          tx,
          ["requests.codePrefix"],
          now,
        );
        const matches = matchStatement(
          created.map((c) => ({
            id: c.id,
            amountCents: c.amountCents,
            description: c.description,
          })),
          await this.openPayments(tx),
          prefix,
        );
        for (const m of matches) {
          await tx.bankStatementLine.update({
            where: { id: m.lineId },
            data: { status: "MATCHED", paymentId: m.paymentId, matchedBy: "AUTO", decidedAt: now },
          });
        }
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "BANK_STATEMENT_IMPORTED",
          targetType: "BankStatement",
          targetId: statement.id,
          after: {
            format: parsed.format,
            lines: fresh.length,
            skipped: parsed.lines.length - fresh.length,
            matched: matches.length,
          },
        });
        return {
          id: statement.id,
          format: parsed.format,
          lines: fresh.length,
          skipped: parsed.lines.length - fresh.length,
          matched: matches.length,
          unmatched: fresh.length - matches.length,
        };
      },
      { timeoutMs: 60_000 },
    );
  }

  async statements(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) =>
      (await tx.bankStatement.findMany({ orderBy: { importedAt: "desc" }, take: 50 })).map((s) => ({
        id: s.id,
        format: s.format,
        fileName: s.fileName,
        lines: s.lineCount,
        importedAt: s.importedAt.toISOString(),
      })),
    );
  }

  /** The queue: the lines without a match, the oldest first; or the others, for the record. */
  async lines(auth: AuthContext, status: "UNMATCHED" | "MATCHED" | "IGNORED") {
    return withContext(this.db, auth.db, async (tx) => {
      const lines = await tx.bankStatementLine.findMany({
        where: { status },
        orderBy: [{ bookingDate: status === "UNMATCHED" ? "asc" : "desc" }],
        take: 300,
      });
      const open = status === "UNMATCHED" ? await this.openPayments(tx) : [];
      const matchedPayments =
        status === "MATCHED"
          ? await this.paymentCodes(
              tx,
              lines.flatMap((l) => (l.paymentId ? [l.paymentId] : [])),
            )
          : new Map<string, string>();
      return lines.map((l) => ({
        id: l.id,
        bookingDate: isoDay(l.bookingDate),
        amountCents: l.amountCents,
        currency: l.currency,
        counterparty: l.counterparty,
        description: l.description,
        reference: l.reference,
        status: l.status,
        matchedBy: l.matchedBy,
        note: l.note,
        requestCode: l.paymentId ? (matchedPayments.get(l.paymentId) ?? null) : null,
        // Suggestions for the person: the open payments with the same amount.
        candidates:
          l.amountCents > 0
            ? open
                .filter((p) => p.amountCents === l.amountCents)
                .slice(0, 10)
                .map((p) => ({ id: p.id, requestCode: p.requestCode }))
            : [],
      }));
    });
  }

  private async paymentCodes(tx: DbTransaction, ids: string[]) {
    const payments = await asSystem(tx, () =>
      tx.payment.findMany({
        where: { id: { in: ids } },
        include: { acceptance: { select: { quoteRequestId: true } } },
      }),
    );
    const requests = await asSystem(tx, () =>
      tx.quoteRequest.findMany({
        where: { id: { in: payments.map((p) => p.acceptance.quoteRequestId) } },
        select: { id: true, code: true },
      }),
    );
    return new Map(
      payments.map((p) => [
        p.id,
        requests.find((r) => r.id === p.acceptance.quoteRequestId)?.code ?? "",
      ]),
    );
  }

  private async line(tx: DbTransaction, id: string) {
    const line = await tx.bankStatementLine.findUnique({ where: { id } });
    if (!line) throw new ProblemError("NOT_FOUND");
    return line;
  }

  /** A match by hand: a payment captured and not matched yet; the note says why. */
  async match(auth: AuthContext, id: string, paymentId: string, note: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const line = await this.line(tx, id);
      if (line.status !== "UNMATCHED") {
        throw new ProblemError("CONFLICT", "Not in the queue", [
          { path: "line", issue: "WRONG_STATE" },
        ]);
      }
      const open = await this.openPayments(tx);
      const payment = open.find((p) => p.id === paymentId);
      if (!payment) {
        throw new ProblemError("VALIDATION_FAILED", "Payment not available", [
          { path: "paymentId", issue: "NOT_AVAILABLE" },
        ]);
      }
      await tx.bankStatementLine.update({
        where: { id },
        data: {
          status: "MATCHED",
          paymentId,
          matchedBy: "MANUAL",
          decidedByUserId: auth.userId,
          note,
          decidedAt: now,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "BANK_LINE_MATCHED",
        targetType: "BankStatementLine",
        targetId: id,
        after: { paymentId, sameAmount: payment.amountCents === line.amountCents },
        reason: note,
      });
      return { id, status: "MATCHED" as const };
    });
  }

  async ignore(auth: AuthContext, id: string, note: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const line = await this.line(tx, id);
      if (line.status !== "UNMATCHED") {
        throw new ProblemError("CONFLICT", "Not in the queue", [
          { path: "line", issue: "WRONG_STATE" },
        ]);
      }
      await tx.bankStatementLine.update({
        where: { id },
        data: { status: "IGNORED", decidedByUserId: auth.userId, note, decidedAt: now },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "BANK_LINE_IGNORED",
        targetType: "BankStatementLine",
        targetId: id,
        reason: note,
      });
      return { id, status: "IGNORED" as const };
    });
  }

  /** Back to the queue (a wrong match); the payment is free again. */
  async reopen(auth: AuthContext, id: string, note: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const line = await this.line(tx, id);
      if (line.status === "UNMATCHED") {
        throw new ProblemError("CONFLICT", "Already in the queue", [
          { path: "line", issue: "WRONG_STATE" },
        ]);
      }
      await tx.bankStatementLine.update({
        where: { id },
        data: {
          status: "UNMATCHED",
          paymentId: null,
          matchedBy: null,
          note,
          decidedByUserId: auth.userId,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "BANK_LINE_REOPENED",
        targetType: "BankStatementLine",
        targetId: id,
        before: { status: line.status, paymentId: line.paymentId },
        reason: note,
      });
      return { id, status: "UNMATCHED" as const };
    });
  }

  /** The daily balance (spec 06 «Quadratura giornaliera»), days in Rome. */
  async daily(auth: AuthContext, from: string, to: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const lines = await tx.bankStatementLine.findMany({
        where: { bookingDate: { gte: dayOf(from), lte: dayOf(to) } },
        select: { bookingDate: true, amountCents: true, status: true },
      });
      const payments = await asSystem(tx, () =>
        tx.payment.findMany({
          where: {
            capturedAt: {
              gte: new Date(`${from}T00:00:00.000Z`),
              lte: new Date(`${to}T23:59:59.999Z`),
            },
            status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] },
          },
          select: { capturedAt: true, premiumCents: true, feeCents: true },
        }),
      );
      return dailyBalance(
        lines.map((l) => ({
          bookingDate: isoDay(l.bookingDate),
          amountCents: l.amountCents,
          matched: l.status === "MATCHED",
        })),
        payments.flatMap((p) =>
          p.capturedAt
            ? [{ day: romeCalendarDate(p.capturedAt), amountCents: p.premiumCents + p.feeCents }]
            : [],
        ),
      ).filter((d) => d.day >= from && d.day <= to);
    });
  }
}

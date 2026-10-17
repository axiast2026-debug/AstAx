import { settingsAt, SYSTEM_CONTEXT, withContext } from "@astax/db";
import type { PendingEmail } from "../notifier.js";
import { audit, staffRecipients, type ActivityDeps } from "./support.js";
import type { AuctionActivities } from "./types.js";

interface Difference {
  field: "annualGrossPremiumCents" | "companyName";
  declared: string | number;
  read: string | number;
}

/**
 * OFF-09, decision 16: after the closing, never before, each valid offer's PDF
 * quote is read and compared with the declared offer. A difference is a flag
 * for the back office, which decides; nothing is excluded here, and the
 * binding offer stays the declared one. Fields read below
 * documents.confidenceThreshold are not compared.
 */
export function quoteCheckActivities(deps: ActivityDeps): Pick<AuctionActivities, "reviewQuotes"> {
  const { db, clock, cipher, notifier, urls, reader } = deps;

  async function reviewQuotes(input: { auctionId: string }) {
    const todo = await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const auction = await tx.auction.findUniqueOrThrow({ where: { id: input.auctionId } });
      if (auction.status !== "CLOSED") return { auction, offers: [], documents: [], threshold: 1 };
      const offers = await tx.offer.findMany({
        where: {
          auctionId: auction.id,
          status: "AWAITING_CUSTOMER",
          pdfDocumentId: { not: null },
          quoteCheck: null,
        },
      });
      const documents = await tx.document.findMany({
        where: { id: { in: offers.flatMap((o) => (o.pdfDocumentId ? [o.pdfDocumentId] : [])) } },
      });
      const { "documents.confidenceThreshold": threshold } = await settingsAt(
        tx,
        ["documents.confidenceThreshold"],
        clock.now(),
      );
      return { auction, offers, documents, threshold };
    });
    const companies = await withContext(db, SYSTEM_CONTEXT, (tx) => tx.insuranceCompany.findMany());

    // The reader may be slow (the real one is an AI model): outside any transaction.
    const results: {
      offer: (typeof todo.offers)[number];
      differences: Difference[];
      result: "MATCH" | "MISMATCH" | "UNREADABLE";
      model: string;
      promptVersion: string;
    }[] = [];
    for (const offer of todo.offers) {
      const document = todo.documents.find((d) => d.id === offer.pdfDocumentId);
      if (!document) continue;
      const read = await reader.extract({
        kind: "QUOTE_PDF",
        files: [
          { key: document.storageKey, fileName: document.fileName, contentType: document.mime },
        ],
      });
      const sure = (name: string) => {
        const field = read.fields[name];
        return field && field.confidence >= todo.threshold ? field.value : null;
      };
      const premium = sure("annualGrossPremiumCents");
      const company = sure("companyName");
      const declaredCompany = companies.find((c) => c.id === offer.companyId)?.name ?? "";
      const differences: Difference[] = [];
      if (typeof premium === "number" && premium !== offer.annualGrossPremiumCents) {
        differences.push({
          field: "annualGrossPremiumCents",
          declared: offer.annualGrossPremiumCents ?? 0,
          read: premium,
        });
      }
      if (
        typeof company === "string" &&
        company.trim().toLowerCase() !== declaredCompany.toLowerCase()
      ) {
        differences.push({ field: "companyName", declared: declaredCompany, read: company });
      }
      results.push({
        offer,
        differences,
        result:
          premium === null && company === null
            ? "UNREADABLE"
            : differences.length > 0
              ? "MISMATCH"
              : "MATCH",
        model: read.model,
        promptVersion: read.promptVersion,
      });
    }
    if (results.length === 0) return { checked: 0, flagged: 0 };

    const pending: PendingEmail[] = [];
    const flagged = await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const now = clock.now();
      let created = 0;
      let mismatches = 0;
      for (const r of results) {
        const write = await tx.offerQuoteCheck.createMany({
          data: [
            {
              offerId: r.offer.id,
              quoteRequestId: todo.auction.quoteRequestId,
              checkedAt: now,
              result: r.result,
              differences: r.differences as unknown as object[],
              readerModel: r.model,
              promptVersion: r.promptVersion,
            },
          ],
          // A repetition by Temporal finds the check already written.
          skipDuplicates: true,
        });
        created += write.count;
        if (write.count > 0 && r.result === "MISMATCH") mismatches += 1;
      }
      await audit(tx, now, {
        action: "OFFER_QUOTES_CHECKED",
        targetType: "Auction",
        targetId: todo.auction.id,
        after: { checked: created, flagged: mismatches },
      });
      if (mismatches > 0) {
        const request = await tx.quoteRequest.findUniqueOrThrow({
          where: { id: todo.auction.quoteRequestId },
        });
        await notifier.notify(
          tx,
          pending,
          await staffRecipients(tx, cipher, ["BO_VERIFIER", "BO_SUPERVISOR"]),
          "offer.quote_mismatch.bo",
          () => ({
            codice: request.code,
            numero: String(mismatches),
            link: `${urls.admin}/aste`,
          }),
          `/aste`,
          { quoteRequestId: request.id, auctionId: todo.auction.id },
        );
      }
      return mismatches;
    });
    await notifier.flush(pending);
    return { checked: results.length, flagged };
  }

  return { reviewQuotes };
}

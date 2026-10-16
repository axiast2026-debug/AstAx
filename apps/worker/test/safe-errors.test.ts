import { ApplicationFailure } from "@temporalio/activity";
import { describe, expect, it } from "vitest";
import { safe } from "../src/activities/index.js";

describe("activity errors (BC-07, rule 8)", () => {
  it("a database error reaches Temporal without its message, which repeats the query values", async () => {
    const prismaError = Object.assign(
      new Error("Invalid `tx.offer.update()` invocation: annualGrossPremiumCents: 50500"),
      {
        name: "PrismaClientKnownRequestError",
        code: "P2007",
      },
    );
    const failing = safe(async () => {
      throw prismaError;
    });
    const error = await failing().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApplicationFailure);
    expect((error as ApplicationFailure).type).toBe("PrismaClientKnownRequestError:P2007");
    expect(JSON.stringify(error)).not.toContain("50500");
    expect((error as Error).message).not.toContain("50500");
  });

  it("our own failures keep their message and type", async () => {
    const own = ApplicationFailure.nonRetryable("AFTER_FIRST_HALF");
    await expect(
      safe(async () => {
        throw own;
      })(),
    ).rejects.toBe(own);
  });
});

import { describe, expect, it } from "vitest";
import { InMemoryEmailSender, isReservedTestAddress, TestAddressRouter } from "./email-sender.js";

describe("ADR 0020: email to invented users never leaves the demo", () => {
  it("rule 11: the reserved names of tests and examples are recognised", () => {
    expect(
      [
        "anna.moretti@agenzia-uno.test",
        "giulia@example.test",
        "x@example.com",
        "y@mail.example.org",
        "z@host.invalid",
      ].every(isReservedTestAddress),
    ).toBe(true);
    expect(
      ["dan@astaxapp.com", "mario@gmail.com", "a@examples.com", "b@test.it"].some(
        isReservedTestAddress,
      ),
    ).toBe(false);
  });

  it("a reserved address goes to the fake sender, a real one to the provider", async () => {
    const real = new InMemoryEmailSender();
    const fake = new InMemoryEmailSender();
    const router = new TestAddressRouter(real, fake);
    await router.send({ to: "anna.moretti@agenzia-uno.test", subject: "s", text: "t" });
    await router.send({ to: "agente@astaxapp.com", subject: "s", text: "t" });
    expect(fake.sent.map((m) => m.to)).toEqual(["anna.moretti@agenzia-uno.test"]);
    expect(real.sent.map((m) => m.to)).toEqual(["agente@astaxapp.com"]);
  });
});

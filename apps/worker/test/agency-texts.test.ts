import { InMemoryEmailSender } from "@astax/adapters/email";
import { createLogger } from "@astax/shared/logging";
import { describe, expect, it } from "vitest";
import { WorkerNotifier } from "../src/notifier.js";

// VIS-01, rule 8: what the agencies receive in phase 3, rendered from
// seed/notifiche.yaml with the variables the worker passes.
const notifier = new WorkerNotifier(
  new InMemoryEmailSender(),
  createLogger({ name: "test", level: "silent" }),
);
const common = {
  codice: "AX-2026-000123",
  veicolo: "Marca Uno Modello Uno",
  provincia: "MI",
  pacchetto: "Plus",
  decorrenza: "30/11/2026",
  garanzia_minima: "01/12/2026",
  ora_chiusura: "16/11/2026 11:00",
  link: "http://web.test/richieste-in-arrivo",
};

describe("texts for the agencies (VIS-01, rule 8)", () => {
  for (const eventKey of ["auction.invited", "auction.closing_soon", "auction.closed.agency"]) {
    for (const locale of ["it", "sq"] as const) {
      it(`${eventKey} (${locale}) carries no contact of the customer and no price`, () => {
        const variables = {
          ...common,
          stato_offerta: notifier.label("offerStatus.excluded", locale),
          motivo_esclusione: notifier.label("offerExclusion.generic", locale),
          garanzia_offerta: "10/12/2026",
        };
        const { inApp, email } = notifier.render(eventKey, locale, variables);
        const text = JSON.stringify([inApp, email]);
        expect(text).not.toMatch(/€|@|\+39|\d{3}\s?\d{3}\s?\d{4}/);
        expect(text).toContain("AX-2026-000123");
      });
    }
  }

  it("rule 8: the requester's texts of phase 3 carry no price", () => {
    for (const [eventKey, variables] of [
      [
        "auction.closed.requester",
        { nome: "Giulia", codice: "AX-1", veicolo: "Marca", numero_offerte: "3", link: "l" },
      ],
      [
        "guarantee.expiring",
        { nome: "Giulia", veicolo: "Marca", garanzia: "03/12/2026", giorni: "2", link: "l" },
      ],
    ] as const) {
      const { inApp, email } = notifier.render(eventKey, "it", variables);
      expect(JSON.stringify([inApp, email])).not.toContain("€");
    }
  });
});

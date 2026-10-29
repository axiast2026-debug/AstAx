import { describe, expect, it } from "vitest";
import {
  loadNotificationTemplates,
  MissingTemplateVariableError,
  render,
  renderEmail,
} from "./templates.js";

describe("notification texts from seed/notifiche.yaml", () => {
  const templates = loadNotificationTemplates();

  it("loads the file and the team invitation email", () => {
    const email = renderEmail(templates, "team.invitation", {
      nome: "Bianca",
      invitante: "Anna Moretti",
      organizzazione: "Agenzia Uno",
      ruolo: "operatore",
      link: "http://localhost:3000/inviti",
      scadenza: "22 ottobre 2026",
    });
    expect(email.subject).toBe("Agenzia Uno ti invita su AstAx");
    expect(email.text).toContain(
      "Anna Moretti ti ha invitato a lavorare su AstAx per Agenzia Uno con il ruolo di operatore.",
    );
    expect(email.text).toContain("http://localhost:3000/inviti");
  });

  it("refuses to send a text with a missing variable", () => {
    expect(() => render("Ciao {{nome}}", {})).toThrow(MissingTemplateVariableError);
  });
});

describe("phase 7 the template engine", () => {
  it("formats amounts, dates and labels in Italian", () => {
    const vars = {
      importo: { cents: 50_500 },
      quando: { dateTime: "2026-10-14T08:30:00.000Z" },
      giorno: { date: "2026-12-01" },
    };
    const plain = (text: string) => text.replace(/\u00a0/g, " ");
    expect(plain(render("{{importo}} · {{quando}} · {{giorno}}", vars))).toBe(
      "505,00 € · mercoledì 14/10/2026 alle 10:30 · 01/12/2026",
    );
  });

  it("an empty variable leaves no double space, no space before punctuation, no empty line", () => {
    expect(render("Ciao {{nome}} {{cognome}}, ecco.", { nome: "Anna", cognome: "" })).toBe(
      "Ciao Anna, ecco.",
    );
    expect(render("Riga uno\n{{extra}}\nRiga due", { extra: "" })).toBe("Riga uno\nRiga due");
    // An empty line written on purpose stays.
    expect(render("Uno\n\nDue", {})).toBe("Uno\n\nDue");
  });
});

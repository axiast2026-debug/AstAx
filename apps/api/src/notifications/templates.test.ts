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
    const email = renderEmail(templates, "team.invitation", "it", {
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

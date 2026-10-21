import type { ExtractableDocument } from "./document-reader.js";

/**
 * The fields read from each kind of document, with their type. The same list
 * builds the schema of the model's answer (Bedrock) and is what the fakes'
 * fixtures contain. Dates are YYYY-MM-DD; amounts in cents, limits in euros
 * (rule 5). A field not legible in the document is null with confidence 0.
 */
export type FieldType = "string" | "integer" | "date";

export interface FieldSpec {
  name: string;
  type: FieldType;
  /** For the model: what the field is, in Italian like the documents. */
  description: string;
}

const f = (name: string, type: FieldType, description: string): FieldSpec => ({
  name,
  type,
  description,
});

export const DOCUMENT_FIELDS: Record<ExtractableDocument, readonly FieldSpec[]> = {
  REGISTRATION_CERTIFICATE: [
    f("plate", "string", "Targa (campo A), senza spazi"),
    f("vehicleType", "string", "Tipo di veicolo: CAR, MOTORCYCLE o MOPED"),
    f(
      "use",
      "string",
      "Uso (campo J.2 / note): PRIVATE se uso proprio, PROFESSIONAL_OWN se uso professionale del contraente",
    ),
    f("make", "string", "Marca (campo D.1)"),
    f("model", "string", "Modello o denominazione commerciale (campo D.3)"),
    f(
      "fuel",
      "string",
      "Alimentazione (campo P.3): PETROL, DIESEL, LPG, CNG (metano), HYBRID o ELECTRIC",
    ),
    f("displacementCc", "integer", "Cilindrata in cm³ (campo P.1)"),
    f("powerKw", "integer", "Potenza in kW (campo P.2)"),
    f("firstRegistrationDate", "date", "Data di prima immatricolazione (campo B)"),
    f("ownerSurname", "string", "Cognome dell'intestatario (campo C.2.1)"),
    f("ownerGivenName", "string", "Nome dell'intestatario (campo C.2.2)"),
    f("ownerFiscalCode", "string", "Codice fiscale dell'intestatario, se riportato"),
    f("ownerStreet", "string", "Via e numero civico dell'intestatario (campo C.2.3)"),
    f("ownerPostalCode", "string", "CAP dell'intestatario"),
    f("ownerMunicipalityIstat", "string", "Lascia null: il comune lo ricava AstAx"),
    f("ownerProvince", "string", "Sigla della provincia dell'intestatario"),
  ],
  DRIVING_LICENCE: [
    f("surname", "string", "Cognome (campo 1)"),
    f("givenName", "string", "Nome (campo 2)"),
    f("birthDate", "date", "Data di nascita (campo 3)"),
    f("number", "string", "Numero della patente (campo 5)"),
    f("category", "string", "Categoria per le autovetture o i motocicli (campo 9), es. B"),
    f("issuedOn", "date", "Data di rilascio (campo 4a)"),
    f("expiresOn", "date", "Data di scadenza (campo 4b)"),
  ],
  RISK_CERTIFICATE: [
    f("plate", "string", "Targa del veicolo"),
    f("cuClass", "integer", "Classe di merito CU di assegnazione, da 1 a 18"),
    f("currentInsurer", "string", "Compagnia che ha emesso l'attestato"),
    f("expiryDate", "date", "Data di scadenza del contratto"),
    f("riskUniqueId", "string", "Identificativo univoco del rischio (IUR)"),
    f("claimsMainLast5y", "integer", "Sinistri con responsabilità principale negli ultimi 5 anni"),
    f("claimsSharedLast5y", "integer", "Sinistri con responsabilità paritaria negli ultimi 5 anni"),
  ],
  FISCAL_CODE_CARD: [
    f("fiscalCode", "string", "Codice fiscale, 16 caratteri"),
    f("surname", "string", "Cognome"),
    f("givenName", "string", "Nome"),
    f("birthDate", "date", "Data di nascita"),
    f("sex", "string", "Sesso: M o F"),
  ],
  // ADR 0013: the ID card of the owner of a new vehicle.
  IDENTITY_DOCUMENT: [
    f("fiscalCode", "string", "Codice fiscale, 16 caratteri"),
    f("surname", "string", "Cognome"),
    f("givenName", "string", "Nome"),
    f("birthDate", "date", "Data di nascita"),
    f("sex", "string", "Sesso: M o F"),
    f("documentNumber", "string", "Numero del documento"),
    f("expiresOn", "date", "Data di scadenza del documento"),
  ],
  QUOTE_PDF: [
    f("annualGrossPremiumCents", "integer", "Premio annuo lordo totale, in centesimi di euro"),
    f("companyName", "string", "Nome della compagnia assicurativa"),
    f("rcaSingleLimitEur", "integer", "Massimale unico RC auto, in euro interi"),
  ],
};

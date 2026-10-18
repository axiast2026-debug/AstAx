/**
 * The public registry of insurance intermediaries (IVASS RUI, docs/adattatori.md).
 * The lists are imported periodically into RuiRecord; the check at the entry
 * of an agency or broker reads the local copy. Real adapter: the IVASS open
 * data CSV, phase 8. Development and tests use only the fake (rule 9).
 */
export type RuiRegistrySection = "A" | "B" | "E";

export interface RuiRecordInput {
  number: string;
  section: RuiRegistrySection;
  name: string;
  /** Section E: the number of the agency or broker the collaborator works for. */
  linkedNumber?: string;
  /** Section A: the companies the agency has a mandate from. */
  companies: string[];
}

export interface RuiRegistryPort {
  downloadLatest(): Promise<AsyncIterable<RuiRecordInput>>;
}

/**
 * Invented intermediaries (rule 11): the synthetic agencies and broker of the
 * seed, and a few more that are not on AstAx yet, for the entry of new ones.
 * number;section;name;linked;companies
 */
const FAKE_CSV = `number;section;name;linked;companies
A000000001;A;Agenzia Uno;;Compagnia Alfa|Compagnia Beta
A000000002;A;Agenzia Due;;Compagnia Alfa
A000000003;A;Agenzia Tre;;Compagnia Beta|Compagnia Gamma
A000000004;A;Agenzia Quattro;;Compagnia Gamma
A000000005;A;Agenzia Cinque;;Compagnia Beta|Compagnia Delta
A000000006;A;Agenzia Sei;;Compagnia Alfa
A000000007;A;Agenzia Sette;;Compagnia Beta
A000000008;A;Agenzia Otto;;Compagnia Gamma
A000000009;A;Agenzia Nove;;Compagnia Delta
A000000010;A;Agenzia Dieci;;Compagnia Alfa|Compagnia Delta
A000000101;A;Agenzia Undici;;Compagnia Alfa|Compagnia Gamma
A000000102;A;Agenzia Dodici;;Compagnia Beta
A000000103;A;Agenzia Tredici;;Compagnia Delta
B000000001;B;Broker Demo Srl;;
B000000101;B;Broker Nuovo Srl;;
E000000001;E;Marco Rossi;A000000001;
E000000101;E;Sara Leone;A000000101;`;

export function parseRuiCsv(text: string): RuiRecordInput[] {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  if (header !== "number;section;name;linked;companies") {
    throw new Error("Unexpected RUI file header");
  }
  return rows.map((row) => {
    const [number = "", section = "", name = "", linked = "", companies = ""] = row.split(";");
    if (section !== "A" && section !== "B" && section !== "E") {
      throw new Error(`Unexpected RUI section for ${number}`);
    }
    return {
      number,
      section,
      name,
      ...(linked ? { linkedNumber: linked } : {}),
      companies: companies ? companies.split("|") : [],
    };
  });
}

export class FakeRuiRegistry implements RuiRegistryPort {
  constructor(private readonly csv: string = FAKE_CSV) {}

  async downloadLatest(): Promise<AsyncIterable<RuiRecordInput>> {
    const records = parseRuiCsv(this.csv);
    return (async function* () {
      yield* records;
    })();
  }
}

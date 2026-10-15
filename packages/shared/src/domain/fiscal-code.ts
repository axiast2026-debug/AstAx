import { formatCalendarDate, parseCalendarDate } from "./calendar-date.js";

/**
 * Italian fiscal code (codice fiscale) of a natural person: 16 characters.
 *
 *   RSSMRA 80 A 01 H501 U
 *   ^^^^^^ surname and name letters
 *          ^^ year   ^ month letter   ^^ day (+40 for women)
 *                                       ^^^^ cadastral code of the birth place
 *                                            (a "Z" code for a foreign country)
 *                                              ^ check character
 *
 * Omocodia: when two people would get the same code, the Revenue Agency
 * replaces digits, from the right, with letters (0 → L … 9 → V). Those codes
 * are valid and must be accepted.
 */
export type Sex = "M" | "F";

export interface FiscalCodeData {
  /** The code with the omocodia letters turned back into digits. */
  normalized: string;
  birthDate: string;
  sex: Sex;
  birthPlaceCadastralCode: string;
  bornAbroad: boolean;
  isOmocode: boolean;
}

const MONTH_LETTERS = "ABCDEHLMPRST";
const OMOCODE_LETTERS = "LMNPQRSTUV";
/** Positions (0-based) that hold digits and may carry an omocodia letter. */
const OMOCODE_POSITIONS = [6, 7, 9, 10, 12, 13, 14] as const;
const SHAPE =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

const ODD_VALUES: Record<string, number> = {
  "0": 1,
  "1": 0,
  "2": 5,
  "3": 7,
  "4": 9,
  "5": 13,
  "6": 15,
  "7": 17,
  "8": 19,
  "9": 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

function evenValue(char: string): number {
  return /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 65;
}

export function normalizeFiscalCodeInput(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

/** The check character computed from the first fifteen characters. */
export function fiscalCodeCheckChar(firstFifteen: string): string {
  if (!/^[A-Z0-9]{15}$/.test(firstFifteen)) throw new Error("A fiscal code body is 15 characters");
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    const char = firstFifteen[i] as string;
    // Positions are counted from 1: odd positions are the even indexes.
    sum += i % 2 === 0 ? (ODD_VALUES[char] as number) : evenValue(char);
  }
  return String.fromCharCode(65 + (sum % 26));
}

function withoutOmocodia(code: string): string {
  const chars = code.split("");
  for (const position of OMOCODE_POSITIONS) {
    const index = OMOCODE_LETTERS.indexOf(chars[position] as string);
    if (index >= 0) chars[position] = String(index);
  }
  return chars.join("");
}

/**
 * Checks shape and check character and decodes birth date, sex and birth
 * place. The two-digit year is resolved against `referenceDate` (today, read
 * by the caller from `Clock`): a year that would be in the future belongs to
 * the previous century. Returns null for an invalid code.
 */
export function decodeFiscalCode(value: string, referenceDate: string): FiscalCodeData | null {
  const code = normalizeFiscalCodeInput(value);
  if (!SHAPE.test(code)) return null;
  if (fiscalCodeCheckChar(code.slice(0, 15)) !== code[15]) return null;
  const reference = parseCalendarDate(referenceDate);
  if (!reference) throw new Error(`Not a calendar date: ${referenceDate}`);

  const normalized = withoutOmocodia(code);
  const twoDigitYear = Number(normalized.slice(6, 8));
  const month = MONTH_LETTERS.indexOf(normalized[8] as string) + 1;
  const dayField = Number(normalized.slice(9, 11));
  const sex: Sex = dayField > 40 ? "F" : "M";
  const day = sex === "F" ? dayField - 40 : dayField;

  const currentCentury = Math.floor(reference.year / 100) * 100;
  let year = currentCentury + twoDigitYear;
  let birthDate = formatCalendarDate({ year, month, day });
  if (birthDate > referenceDate) {
    year -= 100;
    birthDate = formatCalendarDate({ year, month, day });
  }
  if (!parseCalendarDate(birthDate)) return null;

  const birthPlaceCadastralCode = normalized.slice(11, 15);
  return {
    normalized,
    birthDate,
    sex,
    birthPlaceCadastralCode,
    bornAbroad: birthPlaceCadastralCode.startsWith("Z"),
    isOmocode: normalized !== code,
  };
}

export function isValidFiscalCode(value: string, referenceDate: string): boolean {
  return decodeFiscalCode(value, referenceDate) !== null;
}

function lettersOf(text: string): { consonants: string; vowels: string } {
  const letters = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return {
    consonants: letters.replace(/[AEIOU]/g, ""),
    vowels: letters.replace(/[^AEIOU]/g, ""),
  };
}

export function surnameCode(surname: string): string {
  const { consonants, vowels } = lettersOf(surname);
  return `${consonants}${vowels}XXX`.slice(0, 3);
}

export function givenNameCode(name: string): string {
  const { consonants, vowels } = lettersOf(name);
  if (consonants.length >= 4) return `${consonants[0]}${consonants[2]}${consonants[3]}`;
  return `${consonants}${vowels}XXX`.slice(0, 3);
}

/** True when the first six letters agree with surname and given name. */
export function fiscalCodeMatchesName(code: string, surname: string, givenName: string): boolean {
  const normalized = normalizeFiscalCodeInput(code);
  return normalized.slice(0, 6) === `${surnameCode(surname)}${givenNameCode(givenName)}`;
}

export interface FiscalCodeInput {
  surname: string;
  givenName: string;
  birthDate: string;
  sex: Sex;
  birthPlaceCadastralCode: string;
}

/** Builds the fiscal code of a person (used for synthetic data and tests). */
export function buildFiscalCode(input: FiscalCodeInput): string {
  const date = parseCalendarDate(input.birthDate);
  if (!date) throw new Error(`Not a calendar date: ${input.birthDate}`);
  if (!/^[A-Z]\d{3}$/.test(input.birthPlaceCadastralCode)) {
    throw new Error("A cadastral code is a letter and three digits");
  }
  const year = String(date.year % 100).padStart(2, "0");
  const month = MONTH_LETTERS[date.month - 1] as string;
  const day = String(input.sex === "F" ? date.day + 40 : date.day).padStart(2, "0");
  const body = `${surnameCode(input.surname)}${givenNameCode(input.givenName)}${year}${month}${day}${input.birthPlaceCadastralCode}`;
  return `${body}${fiscalCodeCheckChar(body)}`;
}

/**
 * The omocodia variant of `code` with the last `level` digit positions turned
 * into letters (level 1 changes only the last digit), check character redone.
 */
export function omocodeVariant(code: string, level: number): string {
  if (level < 1 || level > OMOCODE_POSITIONS.length) throw new Error("Omocodia level is 1 to 7");
  const chars = normalizeFiscalCodeInput(code).split("");
  for (const position of OMOCODE_POSITIONS.slice(-level)) {
    const char = chars[position] as string;
    if (/\d/.test(char)) chars[position] = OMOCODE_LETTERS[Number(char)] as string;
  }
  const body = chars.slice(0, 15).join("");
  return `${body}${fiscalCodeCheckChar(body)}`;
}

import type { FieldCipher } from "@astax/adapters/crypto";
import { settingsAt, type DbTransaction } from "@astax/db";
import { aniaSheet, aniaWarnings, type AniaRecord } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { decryptJson } from "../requests/request-support.js";

/**
 * The ANIA record read by plate as the back office and, once confirmed, the
 * invited agencies see it (Dan, 2026-10-28): the sheet, the warnings and the
 * name of the birth place. The rules are the parameters in force at the
 * reading (rule 7).
 */
export async function aniaViewOf(tx: DbTransaction, record: AniaRecord, readAt: Date, now: Date) {
  const settings = await settingsAt(
    tx,
    [
      "verification.ania.claimsYears",
      "verification.ania.expiryNoticeDays",
      "verification.ania.ownerMinAge",
    ],
    readAt,
  );
  const rules = {
    today: romeCalendarDate(now),
    claimsYears: settings["verification.ania.claimsYears"],
    expiryNoticeDays: settings["verification.ania.expiryNoticeDays"],
    ownerMinAge: settings["verification.ania.ownerMinAge"],
  };
  const sheet = aniaSheet(record, rules);
  const place =
    sheet.birthPlaceCadastralCode && !sheet.bornAbroad
      ? await tx.municipality.findUnique({
          where: { cadastralCode: sheet.birthPlaceCadastralCode },
        })
      : null;
  return {
    plate: record.plate,
    readAt: readAt.toISOString(),
    sheet,
    birthPlace: place ? { name: place.name, province: place.province } : null,
    warnings: aniaWarnings(record, rules),
  };
}

/** The view of a stored, encrypted record. */
export function storedAniaView(
  tx: DbTransaction,
  cipher: FieldCipher,
  stored: { aniaEnc: string; aniaReadAt: Date },
  now: Date,
) {
  return aniaViewOf(tx, decryptJson(cipher, stored.aniaEnc) as AniaRecord, stored.aniaReadAt, now);
}

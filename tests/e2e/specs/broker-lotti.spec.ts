import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SystemClock } from "@astax/adapters/clock";
import { addCalendarDays } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { brokerLogin, newFiscalCode } from "../support/broker.js";

const clock = new SystemClock();

/** A row of the lot, written in the template's first sheet as Excel's inline text. */
function withRow(template: Uint8Array, cells: string[]): Uint8Array {
  const files = unzipSync(template);
  const path = "xl/worksheets/sheet1.xml";
  const sheet = strFromU8(files[path] ?? new Uint8Array());
  const row =
    `<row r="2">` +
    cells
      .map(
        (value, i) =>
          `<c r="${String.fromCharCode(65 + i)}2" t="inlineStr"><is><t>${value}</t></is></c>`,
      )
      .join("") +
    `</row>`;
  files[path] = strToU8(sheet.replace("</sheetData>", `${row}</sheetData>`));
  return zipSync(files);
}

/**
 * The broker's lots (Dan, 2026-10-21, ADR 0014): the template from AstAx, one
 * row per vehicle to renew; each row becomes a request that leaves by itself
 * 7 days before the expiry.
 */
test.describe("lotti del broker", () => {
  test.describe.configure({ timeout: 180_000 });

  test("Paolo scarica il modello, carica un rinnovo e lo ritrova con il giorno in cui parte", async ({
    browser,
  }) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await brokerLogin(page);
    await page
      .getByRole("navigation", { name: "Menu principale" })
      .getByRole("link", { name: "Lotti" })
      .click();
    await expect(page.getByRole("heading", { name: "Lotti", level: 1 })).toBeVisible();

    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Scarica il modello Excel" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("astax-modello-lotto.xlsx");
    const template = new Uint8Array(await readFile((await download.path()) ?? ""));

    // The template as it is, without rows: refused, nothing saved.
    await page.getByLabel("File Excel (.xlsx)").setInputFiles({
      name: "vuoto.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(template),
    });
    await page.getByRole("button", { name: "Carica il file" }).click();
    await expect(page.getByText("Il file non ha righe.")).toBeVisible();

    const today = romeCalendarDate(clock.now());
    const expiry = addCalendarDays(today, 40);
    const [y, m, d] = expiry.split("-");
    const surname = `Lotto${randomBytes(3).toString("hex")}`;
    const plate = `LT${String(randomBytes(2).readUInt16BE() % 1000).padStart(3, "0")}EE`;
    const file = withRow(template, [
      plate,
      `${d}/${m}/${y}`,
      surname,
      "Elena",
      newFiscalCode("Rossi", "Elena", "F"),
      "",
      "",
      "Via dei Rinnovi 3",
      "20121",
      "Milano",
      "MI",
      "Guida libera",
      "",
      "",
    ]);
    await page.getByLabel("File Excel (.xlsx)").setInputFiles({
      name: "rinnovi.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(file),
    });
    await page.getByRole("button", { name: "Carica il file" }).click();
    await expect(page.getByText("Una richiesta creata.")).toBeVisible({ timeout: 30_000 });
    const row = page.getByRole("row", { name: new RegExp(surname) });
    await expect(row.getByText("Bozza")).toBeVisible();
    const ad = addCalendarDays(expiry, -7).split("-")[2];
    await expect(row.getByText(new RegExp(`Parte da sola il .*${Number(ad)}`))).toBeVisible();
    await page.screenshot({ path: "test-results/lotto-broker.png" });

    // The lot in the list.
    await page.getByRole("link", { name: "Torna ai lotti" }).click();
    await expect(page.getByRole("cell", { name: "rinnovi.xlsx" }).first()).toBeVisible();
  });
});

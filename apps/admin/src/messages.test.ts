import { MENU_KEYS } from "@astax/ui";
import { describe, expect, it } from "vitest";
import it_ from "../messages/it.json";
import sq from "../messages/sq.json";

const keys = (value: unknown, prefix = ""): string[] =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

describe("back office translations (Italian and Albanian)", () => {
  it("both languages have exactly the same texts", () => {
    expect(keys(sq).sort()).toEqual(keys(it_).sort());
  });

  it("every menu item has a label in both languages", () => {
    for (const messages of [it_, sq]) {
      const menu = messages.menu as Record<string, string>;
      expect(MENU_KEYS.filter((key) => !menu[key])).toEqual([]);
    }
  });
});

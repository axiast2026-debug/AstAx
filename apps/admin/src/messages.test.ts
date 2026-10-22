import { MENU_KEYS } from "@astax/ui";
import { describe, expect, it } from "vitest";
import it_ from "../messages/it.json";

describe("back office translations (Italian only, ADR 0017)", () => {
  it("every menu item has a label", () => {
    const menu = it_.menu as Record<string, string>;
    expect(MENU_KEYS.filter((key) => !menu[key])).toEqual([]);
  });
});

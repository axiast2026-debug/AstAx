import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { SystemClock } from "@astax/adapters/clock";

/** Real time, as the Keycloak login of the support helpers (rule 6 applies to the app). */
const clock = new SystemClock();
import type { Page } from "@playwright/test";

/**
 * Measures one flow of the UX review: screens seen, taps, fields typed,
 * choices made, photos or files picked, and the time waited for the server.
 * Every screen is shot at 390 px and 1440 px and checked with axe (WCAG 2.2 AA,
 * every impact). Results go under docs/ux-review/<date>/{schermate,misure}/<phase>/.
 */
export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1440, height: 900 };

const ROOT = new URL("../../../docs/ux-review/2026-10-23/", import.meta.url);
const PHASE = process.env.UX_PHASE ?? "prima";

export interface ScreenRecord {
  index: number;
  name: string;
  path: string;
  /** Visible fields to fill (inputs, selects, textareas; hidden and submit excluded). */
  fields: number;
  requiredFields: number;
  /** Visible buttons and links in the main content. */
  actions: number;
  /** Accessibility problems of axe, by impact, at the main width of the flow. */
  axe: { id: string; impact: string; nodes: number; help: string }[];
  /** Seconds since the previous screen (wall clock on this machine). */
  sinceLastS: number;
}

export interface FlowMeasure {
  flow: string;
  who: string;
  phase: string;
  mainWidth: number;
  screens: ScreenRecord[];
  taps: number;
  typed: number;
  choices: number;
  files: number;
  /** Seconds a person waits for the system (uploads, signature, payment, auction tools). */
  waitS: number;
  wallS: number;
  /** Estimated time for a real person, in seconds (see docs/ux-review/.../rapporto.md, «Come abbiamo misurato»). */
  estimatedS: number;
}

export class Meter {
  private readonly screens: ScreenRecord[] = [];
  private taps = 0;
  private typed = 0;
  private choices = 0;
  private files = 0;
  private waitS = 0;
  private readonly startedAt = clock.now().getTime();
  private lastAt = clock.now().getTime();

  constructor(
    readonly flow: string,
    readonly who: string,
    readonly mainWidth: number = PHONE.width,
  ) {
    mkdirSync(this.dir("schermate"), { recursive: true });
    mkdirSync(this.dir("misure"), { recursive: true });
  }

  private dir(kind: "schermate" | "misure"): string {
    return join(
      decodeURIComponent(ROOT.pathname.replace(/^\/([A-Za-z]:)/, "$1")),
      kind,
      PHASE,
      kind === "schermate" ? this.flow : "",
    );
  }

  /** One screen the person sees: shots at both widths, counts and axe. */
  async screen(page: Page, name: string): Promise<void> {
    const index = this.screens.length + 1;
    const file = `${String(index).padStart(2, "0")}-${name}`;
    const main = this.mainWidth === PHONE.width ? PHONE : DESKTOP;
    const other = this.mainWidth === PHONE.width ? DESKTOP : PHONE;
    await page.setViewportSize(main);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    // The App Router streams the page after its skeleton (loading.tsx): wait for the content.
    await page
      .locator('[role="status"][aria-live="polite"]:has(span[aria-hidden].bg-warm-100)')
      .waitFor({ state: "detached", timeout: 60_000 })
      .catch(() => undefined);
    await page.screenshot({
      path: join(this.dir("schermate"), `${file}-${main.width}.png`),
      fullPage: true,
    });
    const counts = await page.evaluate(() => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const fields = [
        ...document.querySelectorAll<HTMLInputElement>(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea',
        ),
      ].filter(visible);
      const root = document.querySelector("main") ?? document.body;
      const actions = [
        ...root.querySelectorAll('button, a[href], [role="button"], input[type="submit"]'),
      ].filter(visible);
      return {
        fields: fields.length,
        requiredFields: fields.filter((f) => f.required).length,
        actions: actions.length,
      };
    });
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze()
      .then((r) =>
        r.violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? "minor",
          nodes: v.nodes.length,
          help: v.help,
        })),
      )
      .catch((error: unknown) => [
        { id: "axe-error", impact: "unknown", nodes: 0, help: String(error) },
      ]);
    await page.setViewportSize(other);
    await page.screenshot({
      path: join(this.dir("schermate"), `${file}-${other.width}.png`),
      fullPage: true,
    });
    await page.setViewportSize(main);
    const now = clock.now().getTime();
    this.screens.push({
      index,
      name,
      path: new URL(page.url()).pathname,
      ...counts,
      axe,
      sinceLastS: Math.round((now - this.lastAt) / 100) / 10,
    });
    this.lastAt = now;
  }

  tap(n = 1): void {
    this.taps += n;
  }
  type(n = 1): void {
    this.typed += n;
  }
  choose(n = 1): void {
    this.choices += n;
  }
  file(n = 1): void {
    this.files += n;
  }
  wait(seconds: number): void {
    this.waitS += seconds;
  }

  /**
   * A real person: 3 s to read each screen, 1.5 s per tap, 6 s per field to
   * type, 2 s per choice, 10 s per photo or file, plus the waits for the system.
   */
  private estimate(): number {
    return Math.round(
      this.screens.length * 3 +
        this.taps * 1.5 +
        this.typed * 6 +
        this.choices * 2 +
        this.files * 10 +
        this.waitS,
    );
  }

  save(): FlowMeasure {
    const measure: FlowMeasure = {
      flow: this.flow,
      who: this.who,
      phase: PHASE,
      mainWidth: this.mainWidth,
      screens: this.screens,
      taps: this.taps,
      typed: this.typed,
      choices: this.choices,
      files: this.files,
      waitS: Math.round(this.waitS),
      wallS: Math.round((clock.now().getTime() - this.startedAt) / 1000),
      estimatedS: this.estimate(),
    };
    writeFileSync(join(this.dir("misure"), `${this.flow}.json`), JSON.stringify(measure, null, 2));
    return measure;
  }
}

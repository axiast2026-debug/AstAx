"use client";

import { Icon } from "@astax/ui";
import { useState } from "react";

/**
 * The latest true events of AstAx (ADR 0016, proposal P8), in order of time,
 * none chosen. It moves slowly and stops under the pointer, with the keyboard
 * and with its button (WCAG 2.2.2); with «reduce motion» it is a row to
 * scroll by hand.
 */
export function LiveTicker({
  items,
  label,
  pauseLabel,
  playLabel,
}: {
  items: { key: string; time: string; where: string; what: string }[];
  label: string;
  pauseLabel: string;
  playLabel: string;
}) {
  const [paused, setPaused] = useState(false);
  const row = (copy: number) =>
    items.map((item) => (
      <span
        key={`${copy}-${item.key}`}
        aria-hidden={copy === 1 ? true : undefined}
        className="inline-flex shrink-0 items-center gap-2 pr-8 text-table whitespace-nowrap"
      >
        <b className="tabular">{item.time}</b>
        <span className="rounded-md bg-night-800 px-1.5 text-note font-semibold text-night-300">
          {item.where}
        </span>
        {item.what}
      </span>
    ));
  return (
    <div
      className="ticker flex items-center gap-2 border-y border-night-800 bg-night-950 text-white"
      data-paused={paused}
    >
      <div
        className="ticker-scroller min-w-0 flex-1 overflow-hidden"
        role="region"
        aria-label={label}
      >
        <div className="ticker-track flex w-max py-3 pl-4">
          {row(0)}
          {row(1)}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? playLabel : pauseLabel}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-white hover:bg-night-800 focus-visible:outline-2 focus-visible:outline-orange-400"
      >
        <Icon name={paused ? "play" : "pause"} />
      </button>
    </div>
  );
}

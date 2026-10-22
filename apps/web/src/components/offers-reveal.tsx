"use client";

import { formatEuroCents } from "@astax/shared/format";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { REVEAL_AT } from "@/components/offers-reveal-timing";

/** The saving rises after the cascade (ms from the first paint). */
const COUNT_AT = REVEAL_AT + 3 * 120 + 420;
const COUNT_FOR = 1200;

/**
 * The opening of the envelopes (Momento 3), only the first time the requester
 * sees the offers of an auction round: the lids and the cascade are CSS
 * (motion.css), so the page works without scripts; here the round is marked
 * as seen and the saving rises from zero. A late hydration, or «reduce
 * motion», leaves the final figure as it is.
 */
export function OffersReveal({
  seenCookie,
  animate,
  className,
  children,
}: {
  seenCookie: string;
  animate: boolean;
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!animate) return;
    document.cookie = `${seenCookie}=1; path=/preventivi; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
    const figures = [...(root.current?.querySelectorAll<HTMLElement>("[data-count-cents]") ?? [])];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The figure is already on screen when the page hydrates after the cascade: no rewind.
    if (reduce || figures.length === 0 || performance.now() > REVEAL_AT) return;
    const show = (k: number) => {
      for (const el of figures) {
        const cents = Number(el.dataset.countCents);
        el.textContent = formatEuroCents(Math.round(cents * (1 - Math.pow(1 - k, 3))));
      }
    };
    show(0);
    let frame = 0;
    const start = performance.now() + Math.max(0, COUNT_AT - performance.now());
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / COUNT_FOR));
      show(k);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      show(1);
    };
  }, [animate, seenCookie]);
  const style = animate ? ({ "--reveal-at": `${REVEAL_AT}ms` } as CSSProperties) : undefined;
  return (
    <div ref={root} className={className} data-reveal={animate ? "" : undefined} style={style}>
      {children}
    </div>
  );
}

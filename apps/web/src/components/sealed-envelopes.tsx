"use client";

import { Icon } from "@astax/ui";
import { useEffect, useState } from "react";

/** Envelope tiles shown at most: the number says the rest. */
const MAX_TILES = 12;

/**
 * The envelopes arrived so far (VIS-03): one sealed tile each, never empty
 * places (the customer must not guess how many agencies were invited). A
 * new envelope since the last look comes in with a light bounce.
 */
export function SealedEnvelopes({
  count,
  seenKey,
  onDark = false,
}: {
  count: number;
  /** One per request and round: what this browser has already seen. */
  seenKey: string;
  onDark?: boolean;
}) {
  const [seen, setSeen] = useState(count);
  useEffect(() => {
    let before = count;
    try {
      const stored = sessionStorage.getItem(seenKey);
      if (stored !== null) before = Math.min(Number(stored), count);
      sessionStorage.setItem(seenKey, String(count));
    } catch {
      // No storage (private browsing): nothing arrives with a bounce.
    }
    setSeen(before);
  }, [count, seenKey]);
  return (
    <div aria-hidden className="flex flex-wrap gap-2">
      {Array.from({ length: Math.min(count, MAX_TILES) }, (_, i) => (
        <span
          key={i}
          className={`inline-flex size-11 items-center justify-center rounded-xl ${
            onDark ? "bg-night-800 text-white" : "bg-night-900 text-white"
          } ${i >= seen ? "arrive" : ""}`}
        >
          <Icon name="envelope" size={26} />
        </span>
      ))}
    </div>
  );
}

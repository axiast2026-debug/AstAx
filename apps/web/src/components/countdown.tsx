"use client";

import { useEffect, useState } from "react";

/** Time left until the closing of the auction (VIS-03), updated every second. */
export function Countdown({ until, closedLabel }: { until: string; closedLabel: string }) {
  const end = Date.parse(until);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    // The browser's clock only paints the countdown: the server's time decides (BC-05).
    // eslint-disable-next-line astax/no-system-time
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [end]);
  if (left === null) return null;
  if (left === 0) return <span>{closedLabel}</span>;
  const s = Math.floor(left / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className="tabular">{`${hh}:${pad(mm)}:${pad(ss)}`}</span>;
}

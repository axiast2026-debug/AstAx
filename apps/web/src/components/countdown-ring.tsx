"use client";

import { Icon } from "@astax/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export interface WorkingTime {
  /** The server's clock when it answered. */
  serverNow: string;
  workingSecondsLeft: number;
  totalWorkingSeconds: number;
  /** Outside the working hours: when the time counts again. */
  pausedUntil: string | null;
  /** Inside them: until when it counts without a pause. */
  runsUntil: string | null;
}

type Phase = "normal" | "lastHour" | "last15" | "paused" | "closed";

const HOUR = 3600;
const QUARTER = 900;
const R = 42;
const LENGTH = 2 * Math.PI * R;

const pad = (n: number) => String(n).padStart(2, "0");
const clockText = (s: number) =>
  `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

/** The size of the figure in the middle, by ring size (design system, CountdownRing). */
const FIGURE: Record<number, string> = {
  220: "text-price",
  200: "text-price",
  160: "text-screen",
  // 96: «1:59:38» must fit inside the arc.
  96: "text-body",
};

/**
 * The working seconds left, counted from the server's clock (ASTA-02): still
 * outside the working hours; at the pause or the closing the page asks the
 * server again.
 */
export function useWorkingSecondsLeft(time: WorkingTime): number {
  const router = useRouter();
  const [left, setLeft] = useState(time.workingSecondsLeft);

  useEffect(() => {
    setLeft(time.workingSecondsLeft);
    const at = Date.parse(time.serverNow);
    const start = performance.now();
    const serverNow = () => at + (performance.now() - start);
    // Still: wake up at the opening, the page then asks the server again.
    if (time.pausedUntil) {
      const wait = Date.parse(time.pausedUntil) - at;
      const timer = setTimeout(() => router.refresh(), Math.min(Math.max(wait, 1000), 2 ** 31 - 1));
      return () => clearTimeout(timer);
    }
    if (!time.runsUntil || time.workingSecondsLeft <= 0) return;
    const stopAt = Date.parse(time.runsUntil);
    const tick = () => {
      const now = Math.min(serverNow(), stopAt);
      const s = Math.max(0, Math.round(time.workingSecondsLeft - (now - at) / 1000));
      setLeft(s);
      // The evening pause or the closing: the server tells what comes next.
      if (now >= stopAt) {
        clearInterval(timer);
        router.refresh();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [time, router]);
  return left;
}

/**
 * The auction's time (ASTA-02, Momento 2): the arc is the working time left,
 * counted from the server's clock; outside the working hours it stands still
 * and says when it resumes. Orange in the last hour, darker and thicker in
 * the last 15 minutes, never flashing. Screen readers hear it once a minute.
 */
export function CountdownRing({
  time,
  size,
  onDark = false,
  announce = true,
  resumeLabel,
}: {
  time: WorkingTime;
  size: 24 | 32 | 96 | 160 | 200 | 220;
  onDark?: boolean;
  /** Once a minute to screen readers; off for the small rings of a list. */
  announce?: boolean;
  /** «domani alle 9:00»: when a paused clock resumes, already in words. */
  resumeLabel: string | null;
}) {
  const left = useWorkingSecondsLeft(time);
  return (
    <Ring
      time={time}
      left={left}
      size={size}
      onDark={onDark}
      announce={announce}
      resumeLabel={resumeLabel}
    />
  );
}

/** The drawing of the ring for a number of seconds already counted. */
function Ring({
  time,
  left,
  size,
  onDark,
  announce,
  resumeLabel,
}: {
  time: WorkingTime;
  left: number;
  size: 24 | 32 | 96 | 160 | 200 | 220;
  onDark: boolean;
  announce: boolean;
  resumeLabel: string | null;
}) {
  const t = useTranslations("auctionView.ring");

  const phase: Phase =
    left <= 0
      ? "closed"
      : time.pausedUntil
        ? "paused"
        : left <= QUARTER
          ? "last15"
          : left <= HOUR
            ? "lastHour"
            : "normal";
  const fraction = time.totalWorkingSeconds > 0 ? Math.min(1, left / time.totalWorkingSeconds) : 0;
  const dash = `${(fraction * LENGTH).toFixed(2)} ${LENGTH.toFixed(2)}`;
  // The small rings of a list draw thicker, so the arc still reads at 24-32 px.
  const stroke = (w: number) => (size <= 32 ? Math.min(w * 2.2, 16) : w);
  const arcs: { phase: Phase; className: string; width: number }[] = [
    { phase: "normal", className: onDark ? "stroke-night-300" : "stroke-night-900", width: 5 },
    { phase: "lastHour", className: onDark ? "stroke-orange-400" : "stroke-orange-500", width: 5 },
    { phase: "last15", className: onDark ? "stroke-orange-600" : "stroke-orange-700", width: 8 },
    { phase: "paused", className: "stroke-warm-400", width: 5 },
  ];

  // Once a minute for screen readers, never every second.
  const minutes = Math.ceil(left / 60);
  const spoken =
    phase === "closed"
      ? t("srClosed")
      : phase === "paused"
        ? t("srPaused", { when: resumeLabel ?? "" })
        : t("srLeft", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });

  const figure = FIGURE[size];
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth={stroke(phase === "last15" ? 8 : 5)}
          className={onDark ? "stroke-night-700" : "stroke-warm-200"}
          strokeDasharray={phase === "paused" ? "3 3" : undefined}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.phase}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeLinecap="round"
            strokeWidth={stroke(arc.width)}
            strokeDasharray={dash}
            className={`ring-phase ${arc.className}`}
            style={{ opacity: phase === arc.phase ? 1 : 0 }}
          />
        ))}
      </svg>
      {figure ? (
        <span
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          {phase === "paused" ? <Icon name="pause" size={size >= 160 ? 28 : 20} /> : null}
          {phase === "closed" ? <Icon name="envelopeOpen" size={size >= 160 ? 32 : 20} /> : null}
          {phase === "paused" || phase === "closed" ? (
            <span className="text-label font-semibold">
              {phase === "paused" ? t("paused") : t("closed")}
            </span>
          ) : (
            <span
              className={`font-display font-extrabold tabular ${figure} ${
                phase === "last15" ? (onDark ? "text-orange-400" : "text-orange-700") : ""
              }`}
            >
              {clockText(left)}
            </span>
          )}
          {phase === "paused" ? (
            <span className={`text-note tabular ${onDark ? "text-night-300" : "text-warm-600"}`}>
              {t("leftPaused", { time: clockText(left) })}
            </span>
          ) : phase === "closed" ? null : (
            <span className={`text-note ${onDark ? "text-night-300" : "text-warm-600"}`}>
              {t("toClosing")}
            </span>
          )}
        </span>
      ) : null}
      {announce ? (
        <span role="status" aria-live="polite" className="sr-only">
          {spoken}
        </span>
      ) : null}
    </span>
  );
}

/**
 * «Chiude tra» in a list (Area agenzia, P5): a small ring and the time left.
 * On light, orange-700 in bold in the last hour; on night blue (the radar),
 * orange-400. Silent for screen readers: the text is already there.
 */
export function ClosesIn({
  time,
  size,
  onDark = false,
}: {
  time: WorkingTime;
  size: 24 | 32;
  onDark?: boolean;
}) {
  const t = useTranslations("auctionView.ring");
  const left = useWorkingSecondsLeft(time);
  const lastHour = left > 0 && left <= HOUR;
  const tone = onDark
    ? "font-semibold text-orange-400"
    : lastHour
      ? "font-bold text-orange-700"
      : "";
  return (
    <span className="inline-flex items-center gap-2">
      <Ring
        time={time}
        left={left}
        size={size}
        onDark={onDark}
        announce={false}
        resumeLabel={null}
      />
      <span className={`tabular ${tone}`}>
        {left <= 0
          ? t("closed")
          : time.pausedUntil
            ? t("leftPaused", { time: clockText(left) })
            : clockText(left)}
      </span>
    </span>
  );
}

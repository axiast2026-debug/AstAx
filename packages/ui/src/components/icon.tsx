import type { SVGAttributes } from "react";

const CIRCLE = "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z";
const DOC = "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z";
const SHIELD = "M12 3 19.5 6v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z";
const ENVELOPE = "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z";
const LOCK_BODY =
  "M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-7A1.5 1.5 0 0 1 6.5 11z";

/** AstAx line icons: 24 grid, stroke 1.75, round ends (design system, «Icone»). */
const ICONS = {
  envelope: [
    ENVELOPE,
    "M2.7 6.4 9 10.9",
    "M21.3 6.4 15 10.9",
    "M9.8 11.2h4.4a.8.8 0 0 1 .8.8v3.4a.8.8 0 0 1-.8.8H9.8a.8.8 0 0 1-.8-.8V12a.8.8 0 0 1 .8-.8z",
    "M10.4 11.2V9.9a1.6 1.6 0 0 1 3.2 0v1.3",
  ],
  envelopeOpen: ["M3 10.2 12 4l9 6.2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M3.4 10.6 12 16l8.6-5.4"],
  lock: [LOCK_BODY, "M8 11V7.5a4 4 0 0 1 8 0V11", "M12 15v2"],
  shield: [SHIELD],
  shieldCheck: [SHIELD, "M8.8 12.2 11 14.4l4.2-4.4"],
  clock: [CIRCLE, "M12 7.5V12l3 2"],
  hourglass: [
    "M6.5 3h11",
    "M6.5 21h11",
    "M8 3v2.6c0 2.1 1.7 3.6 4 6.4 2.3-2.8 4-4.3 4-6.4V3",
    "M8 21v-2.6c0-2.1 1.7-3.6 4-6.4 2.3 2.8 4 4.3 4 6.4V21",
  ],
  check: ["M5 12.5 9.5 17 19 7.5"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  arrowLeft: ["M19 12H5", "M11 6l-6 6 6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronUp: ["M6 15l6-6 6 6"],
  info: [CIRCLE, "M12 11v5", "M12 7.9v.2"],
  warning: [
    "M10.3 4.6a2 2 0 0 1 3.4 0l7.4 12.9a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3z",
    "M12 9.5v4",
    "M12 16.9v.2",
  ],
  document: [DOC, "M14 3v5h5", "M9 13h6", "M9 17h6"],
  calendarPlus: [
    "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    "M4 9.5h16",
    "M8.5 3v4",
    "M15.5 3v4",
    "M12 12.5v5",
    "M9.5 15h5",
  ],
  pause: ["M9 6v12", "M15 6v12"],
  checkCircle: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M8 12.3l2.7 2.7L16 9.7"],
  refresh: [
    "M19.5 10.5A7.5 7.5 0 0 0 6 6.3L4.5 8",
    "M4.5 4v4h4",
    "M4.5 13.5A7.5 7.5 0 0 0 18 17.7l1.5-1.7",
    "M19.5 20v-4h-4",
  ],
  sparkle: [
    "M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z",
    "M19 16.5v3",
    "M17.5 18h3",
  ],
  trendDown: ["M4 6.5l5 5 4-3 7 8", "M15 16.5h5v-5"],
  spinner: ["M12 3a9 9 0 1 0 9 9"],
} as const;

export type IconName = keyof typeof ICONS;

export type IconProps = Omit<SVGAttributes<SVGSVGElement>, "children"> & {
  name: IconName;
  size?: number;
  /** Set it when the icon alone carries meaning; otherwise the icon is hidden from screen readers. */
  label?: string;
};

export function Icon({ name, size = 20, label, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className="shrink-0"
      {...props}
    >
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

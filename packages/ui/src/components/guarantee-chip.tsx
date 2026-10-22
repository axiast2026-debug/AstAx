import { cn } from "../cn.js";
import { Icon, type IconName } from "./icon.js";

export type GuaranteeState = "ok" | "expiring" | "lastDay" | "expired";

const LOOK: Record<
  GuaranteeState,
  { icon: IconName; chip: string; iconClass: string; inline: string }
> = {
  ok: {
    icon: "shield",
    chip: "bg-warm-100 text-night-900",
    iconClass: "",
    inline: "text-night-900",
  },
  expiring: {
    icon: "clock",
    chip: "bg-orange-50 text-orange-700",
    iconClass: "",
    inline: "text-orange-700",
  },
  lastDay: {
    icon: "clock",
    chip: "bg-orange-100 text-night-900",
    iconClass: "text-orange-700",
    inline: "text-orange-700",
  },
  expired: {
    icon: "hourglass",
    chip: "bg-warm-100 text-warm-600",
    iconClass: "",
    inline: "text-warm-600",
  },
};

/**
 * The guaranteed price of an offer (GAR-01…05), always in sight: until when,
 * and how long is left. The texts come from the caller's translations.
 */
export function GuaranteeChip({
  state,
  title,
  detail,
  size = "md",
  className,
}: {
  state: GuaranteeState;
  title: string;
  detail: string;
  size?: "md" | "sm";
  className?: string;
}) {
  const look = LOOK[state];
  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-sm font-medium tabular",
          look.inline,
          className,
        )}
      >
        <Icon name={look.icon} size={16} />
        <span>
          {title} · {detail}
        </span>
      </span>
    );
  }
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-[240ms]",
        look.chip,
        className,
      )}
    >
      <span className={cn("inline-flex", look.iconClass)}>
        <Icon name={look.icon} size={20} />
      </span>
      <span className="flex min-w-0 flex-col tabular">
        <span className="text-label font-semibold">{title}</span>
        <span className={cn("text-note", state === "expiring" ? "text-night-900" : undefined)}>
          {detail}
        </span>
      </span>
    </div>
  );
}

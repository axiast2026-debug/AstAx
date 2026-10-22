import { Badge, Icon, type IconName } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import type { IncomingState } from "@/lib/agency";

/** The look of each state (design system, StatusBadge «incoming»). */
const LOOK: Record<IncomingState, { className: string; icon: IconName | null }> = {
  NEW: { className: "bg-orange-100 text-night-900", icon: null },
  CLAIMED_BY_ME: {
    className: "bg-white text-night-900 shadow-[inset_0_0_0_1px_var(--color-night-900)]",
    icon: "user",
  },
  CLAIMED_BY_COLLEAGUE: { className: "bg-warm-100 text-warm-800", icon: "user" },
  OFFERED: { className: "bg-night-900 text-white", icon: "envelope" },
  DECLINED: {
    className: "bg-white text-warm-600 shadow-[inset_0_0_0_1px_var(--color-warm-200)]",
    icon: null,
  },
};

/** Where a request stands for the agency, with its icon. */
export async function IncomingBadge({
  state,
  claimedBy,
}: {
  state: IncomingState;
  claimedBy?: string | null;
}) {
  const t = await getTranslations("agency.states");
  const look = LOOK[state];
  return (
    <Badge className={`h-auto min-h-6 py-0.5 ${look.className}`}>
      {state === "NEW" ? (
        <span aria-hidden className="size-1.5 rounded-full bg-orange-700" />
      ) : look.icon ? (
        <Icon name={look.icon} size={14} />
      ) : null}
      {state === "CLAIMED_BY_COLLEAGUE" && claimedBy
        ? t("CLAIMED_BY", { name: claimedBy })
        : t(state)}
    </Badge>
  );
}

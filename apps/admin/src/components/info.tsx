import { InfoTip } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/** The «i» next to a title with the description of the box or page (Dan, 2026-10-30). */
export async function Info({ children }: { children: ReactNode }) {
  const t = await getTranslations("app");
  return <InfoTip label={t("info")}>{children}</InfoTip>;
}

import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import it from "../../messages/it.json";
import sq from "../../messages/sq.json";

export const LOCALE_COOKIE = "astax_locale";
export const LOCALES = ["it", "sq"] as const;
export type AdminLocale = (typeof LOCALES)[number];

/** The back office is in Italian and Albanian, chosen in the top bar (CLAUDE.md, «Lingue»). */
export default getRequestConfig(async () => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: AdminLocale = stored === "sq" ? "sq" : "it";
  return { locale, timeZone: "Europe/Rome", messages: locale === "sq" ? sq : it };
});

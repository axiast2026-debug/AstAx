import { getRequestConfig } from "next-intl/server";
import messages from "../../messages/it.json";

/** The customer and professional areas are in Italian only (CLAUDE.md, «Lingue»). */
export default getRequestConfig(async () => ({
  locale: "it",
  timeZone: "Europe/Rome",
  messages,
}));

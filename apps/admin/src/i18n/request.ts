import { getRequestConfig } from "next-intl/server";
import it from "../../messages/it.json";

/** The back office is in Italian only, like all of AstAx (ADR 0017). */
export default getRequestConfig(async () => ({
  locale: "it",
  timeZone: "Europe/Rome",
  messages: it,
}));

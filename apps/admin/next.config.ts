import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  poweredByHeader: false,
  // Tokens and sessions are handled on the server; nothing sensitive is cached.
  serverExternalPackages: ["redis"],
  // Bank statements (camt.053) and the broker's bulk files can pass the default 1 MB.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

export default withNextIntl(config);

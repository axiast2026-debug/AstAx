import type { NextConfig } from "next";
import { baseSecurityHeaders } from "@astax/shared/http";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  poweredByHeader: false,
  // Phase 8: the headers of every answer; the CSP with its nonce is set in src/proxy.ts.
  async headers() {
    const headers = baseSecurityHeaders(process.env.NODE_ENV === "production");
    return [
      {
        source: "/:path*",
        headers: Object.entries(headers).map(([key, value]) => ({ key, value })),
      },
    ];
  },
  // Tokens and sessions are handled on the server; nothing sensitive is cached.
  serverExternalPackages: ["redis"],
  // Document photos go through server actions. Technical cap only: the business
  // limit is documents.maxUploadMb, checked by the API.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

export default withNextIntl(config);

import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Inter, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Big titles and hero numbers: price, countdown, saving.
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["800", "900"],
  variable: "--font-inter-tight",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("name"), description: t("tagline") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Phase 8: every page is rendered per request, so its scripts carry the CSP nonce.
  await headers();
  const t = await getTranslations("app");
  // ADR 0020: the online demo says on every page that only invented data go in.
  const demo = process.env.DEMO_NOTICE === "true";
  return (
    <html lang={await getLocale()} className={`${inter.variable} ${interTight.variable}`}>
      <body className="min-h-screen font-sans">
        {demo ? (
          <p
            role="note"
            className="bg-orange-100 px-4 py-2 text-center text-note font-semibold text-night-900"
          >
            {t("demoNotice")}
          </p>
        ) : null}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

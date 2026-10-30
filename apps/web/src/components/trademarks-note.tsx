import { useTranslations } from "next-intl";

/** ADR 0028: under the offers, whose companies are shown with their logos. */
export function TrademarksNote({ className = "" }: { className?: string }) {
  const t = useTranslations("legal");
  return <p className={`text-note text-warm-600 ${className}`}>{t("trademarks")}</p>;
}

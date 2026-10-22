"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

/** The requests already shown in this tab, per organization (only identifiers). */
const key = (scope: string) => `astax_incoming_seen_${scope}`;
const KEEP = 500;

function readSeen(scope: string): Set<string> | null {
  try {
    const stored = sessionStorage.getItem(key(scope));
    return stored ? new Set(JSON.parse(stored) as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * A row of «Partecipa all'asta» that comes in when it is new since the last
 * look in this tab (Area agenzia: 420 ms, then the highlight fades in about
 * 4 s). The first visit marks nothing.
 */
export function ArrivalRow({
  id,
  scope,
  as: Tag = "tr",
  className,
  children,
}: {
  id: string;
  scope: string;
  as?: "tr" | "li";
  className?: string;
  children: ReactNode;
}) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const seen = readSeen(scope);
    if (seen && !seen.has(id)) setFresh(true);
  }, [id, scope]);
  return <Tag className={`${className ?? ""} ${fresh ? "row-new" : ""}`}>{children}</Tag>;
}

/**
 * Says the new requests once to screen readers and remembers the list. It
 * comes after the rows, so its effect runs after theirs have read the list.
 */
export function ArrivalAnnouncer({
  scope,
  rows,
}: {
  scope: string;
  rows: { id: string; code: string }[];
}) {
  const t = useTranslations("agency.incoming");
  const [news, setNews] = useState<string[]>([]);
  useEffect(() => {
    const seen = readSeen(scope);
    if (seen) setNews(rows.filter((r) => !seen.has(r.id)).map((r) => r.code));
    const all = [...(seen ?? []), ...rows.map((r) => r.id)];
    try {
      sessionStorage.setItem(key(scope), JSON.stringify([...new Set(all)].slice(-KEEP)));
    } catch {
      // Private mode: no highlight, nothing else changes.
    }
  }, [scope, rows]);
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {news.length > 0 ? t("arrived", { codes: news.join(", ") }) : ""}
    </p>
  );
}

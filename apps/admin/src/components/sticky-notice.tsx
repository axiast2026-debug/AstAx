"use client";

import { Icon } from "@astax/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A confirmation (or an error) of a page that refreshes by itself (ADR 0008):
 * it stays until the operator closes it, even when the live refresh renders
 * the page again (UX review 2026-10-23, question 30; Dan: yes). The last
 * message received is kept in the component, so a refresh does not make it
 * vanish after less than a second. Closing it also removes its parameter
 * from the address, so the next action shows its own message again.
 */
export function StickyNotice({
  tone,
  param,
  message,
  closeLabel,
}: {
  tone: "done" | "error";
  /** The query parameter that carries the message (`fatto`, `errore`). */
  param: string;
  message: string | null;
  closeLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [kept, setKept] = useState(message);
  useEffect(() => {
    if (message) setKept(message);
  }, [message]);
  if (!kept) return null;
  const close = () => {
    setKept(null);
    const rest = new URLSearchParams(searchParams);
    rest.delete(param);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`mt-4 flex items-start gap-3 rounded-lg p-3 text-sm ${
        tone === "error" ? "bg-red-50" : "bg-green-50"
      }`}
    >
      <span className="flex-1 self-center">{kept}</span>
      <button
        type="button"
        onClick={close}
        aria-label={closeLabel}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/60"
      >
        <Icon name="close" size={18} />
      </button>
    </p>
  );
}

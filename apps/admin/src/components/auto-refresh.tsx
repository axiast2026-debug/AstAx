"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Reads the page again from the server every few seconds while it is in
 * view (Dan, 2026-10-28: when a colleague takes a request, the list shows it).
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}

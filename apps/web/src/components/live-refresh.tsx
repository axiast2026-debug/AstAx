"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { io } from "socket.io-client";

/**
 * Follows a request (or, in the back office, the auction list; for an agency,
 * its list of requests in target) in real time (ADR 0008): on each change the
 * page reads its data again from the server. The ticket comes from a server
 * action; the browser never holds a token.
 */
export function LiveRefresh({
  ticket,
  follow,
}: {
  ticket: () => Promise<{ ticket: string; url: string } | null>;
  follow: { requestId: string } | "auctions" | "incoming";
}) {
  const router = useRouter();
  const key = typeof follow === "string" ? follow : follow.requestId;
  useEffect(() => {
    let closed = false;
    let socket: ReturnType<typeof io> | null = null;
    void ticket().then((t) => {
      if (!t || closed) return;
      socket = io(t.url, {
        path: "/realtime/socket",
        auth: { ticket: t.ticket },
        transports: ["websocket"],
      });
      socket.on("connect", () => {
        if (follow === "auctions") socket?.emit("follow-auctions", {});
        else if (follow === "incoming") socket?.emit("follow-incoming", {});
        else socket?.emit("follow", { requestId: follow.requestId });
      });
      socket.on("changed", () => router.refresh());
    });
    return () => {
      closed = true;
      socket?.disconnect();
    };
    // Only the key: a refresh gives new props with the same meaning, not a new connection.
  }, [key]);
  return null;
}

"use client";

import { useEffect, useState } from "react";
import { subscribePush, unsubscribePush } from "@/app/actions";

type State = "unsupported" | "denied" | "off" | "on" | "busy" | "error";

const toBytes = (base64url: string) => {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/**
 * Phase 8 (ADR 0011): the push notifications of this phone or browser on or
 * off. The browser asks for permission; the subscription goes to the API
 * through a server action (the browser holds no API token, ADR 0004).
 */
export function PushSwitch({
  publicKey,
  texts,
}: {
  publicKey: string;
  texts: Record<State | "turnOn" | "turnOff" | "title" | "intro", string>;
}) {
  const [state, setState] = useState<State>("busy");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("error"));
  }, [publicKey]);

  async function turnOn() {
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      if ((await Notification.requestPermission()) !== "granted") {
        setState("denied");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(publicKey),
      });
      const json = subscription.toJSON();
      const ok = await subscribePush({
        endpoint: json.endpoint ?? "",
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
      });
      setState(ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }

  async function turnOff() {
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-4 rounded-md border border-warm-200 p-3 text-sm">
      <p className="font-medium">{texts.title}</p>
      <p className="mt-1 text-warm-600">{texts.intro}</p>
      <p className="mt-2" role="status">
        {texts[state]}
      </p>
      {state === "off" || state === "error" ? (
        <button
          type="button"
          onClick={turnOn}
          className="mt-2 rounded-md bg-night-900 px-3 py-1.5 text-white"
        >
          {texts.turnOn}
        </button>
      ) : null}
      {state === "on" ? (
        <button
          type="button"
          onClick={turnOff}
          className="mt-2 rounded-md border border-warm-300 px-3 py-1.5"
        >
          {texts.turnOff}
        </button>
      ) : null}
    </div>
  );
}

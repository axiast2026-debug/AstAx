"use client";

import { Button, cn } from "@astax/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

type State = "LOGIN" | "READY" | "BLOCKED" | "UNKNOWN";
const KEYS = new Set([
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);
/** How often the picture of the portal is read again. */
const REFRESH_MS = 1000;

export interface AniaScreenTexts {
  opening: string;
  error: string;
  states: Record<State, string>;
  focus: string;
  focused: string;
  typeHere: string;
  send: string;
  enter: string;
  tab: string;
  backspace: string;
  reload: string;
  alt: string;
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`/portale-ania/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Dan, 2026-10-28: the browser of the ANIA reader on the server, as a picture
 * the operator clicks on and types into. Nothing typed is kept in the page.
 */
export function AniaScreen({ texts }: { texts: AniaScreenTexts }) {
  const [screen, setScreen] = useState<{ width: number; height: number } | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [focused, setFocused] = useState(false);
  const [line, setLine] = useState("");
  const buffer = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const act = useCallback(async (action: unknown) => {
    const response = await post("azione", action);
    if (!response.ok) {
      setFailed(true);
      return;
    }
    const answer = (await response.json()) as { state: State };
    setState(answer.state);
    setTick((t) => t + 1);
  }, []);

  const open = useCallback(async () => {
    setFailed(false);
    const response = await post("apri", {});
    if (!response.ok) {
      setFailed(true);
      return;
    }
    const answer = (await response.json()) as {
      state: State;
      screen: { width: number; height: number };
    };
    setScreen(answer.screen);
    setState(answer.state);
  }, []);

  useEffect(() => {
    void open();
  }, [open]);

  useEffect(() => {
    if (!screen) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [screen]);

  // Letters are sent together, a moment after the last one.
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const text = buffer.current;
    buffer.current = "";
    if (text) await act({ kind: "text", text });
  }, [act]);

  const onKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length === 1) {
      event.preventDefault();
      buffer.current += event.key;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 250);
    } else if (KEYS.has(event.key)) {
      event.preventDefault();
      await flush();
      await act({ kind: "key", key: event.key });
    }
  };

  const onClick = async (event: MouseEvent<HTMLImageElement>) => {
    if (!screen) return;
    const box = event.currentTarget.getBoundingClientRect();
    await flush();
    await act({
      kind: "click",
      x: Math.round(((event.clientX - box.left) / box.width) * screen.width),
      y: Math.round(((event.clientY - box.top) / box.height) * screen.height),
    });
  };

  if (failed && !screen) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-lg border border-red-600 bg-red-50 p-3 text-sm">
          {texts.error}
        </p>
        <Button onClick={() => void open()}>{texts.reload}</Button>
      </div>
    );
  }
  if (!screen || !state) return <p className="text-sm text-warm-700">{texts.opening}</p>;

  return (
    <div className="space-y-3">
      <p
        role="status"
        className={cn(
          "rounded-lg p-3 text-sm font-semibold",
          state === "READY" ? "bg-green-50 text-green-800" : "bg-warning-50 text-night-900",
        )}
      >
        {texts.states[state]}
      </p>
      {failed ? (
        <p role="alert" className="rounded-lg border border-red-600 bg-red-50 p-3 text-sm">
          {texts.error}
        </p>
      ) : null}
      <div
        tabIndex={0}
        role="application"
        aria-label={texts.focus}
        onKeyDown={(e) => void onKeyDown(e)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          void flush();
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text").slice(0, 200);
          if (text) {
            e.preventDefault();
            void flush().then(() => act({ kind: "text", text }));
          }
        }}
        className={cn(
          "overflow-hidden rounded-xl border-2 bg-white outline-none",
          focused ? "border-orange-500" : "border-warm-200",
        )}
      >
        {/* The picture comes from our own route, which asks the API every time. */}
        <img
          src={`/portale-ania/schermo?n=${tick}`}
          alt={texts.alt}
          width={screen.width}
          height={screen.height}
          onClick={(e) => void onClick(e)}
          className="block h-auto w-full cursor-pointer select-none"
          draggable={false}
        />
      </div>
      <p className="text-xs text-warm-600">{focused ? texts.focused : texts.focus}</p>
      {/* On a phone there is no keyboard to catch: a field that sends what is written. */}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = line;
          setLine("");
          if (text) void act({ kind: "text", text });
        }}
      >
        <label className="text-sm">
          <span className="block text-warm-600">{texts.typeHere}</span>
          <input
            value={line}
            onChange={(e) => setLine(e.target.value.slice(0, 200))}
            autoComplete="off"
            className="block min-h-11 w-64 rounded-lg border border-warm-600 px-3 text-sm"
          />
        </label>
        <Button type="submit" variant="outline" size="sm">
          {texts.send}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void act({ kind: "key", key: "Enter" })}
        >
          {texts.enter}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void act({ kind: "key", key: "Tab" })}
        >
          {texts.tab}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void act({ kind: "key", key: "Backspace" })}
        >
          {texts.backspace}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void open()}>
          {texts.reload}
        </Button>
      </form>
    </div>
  );
}

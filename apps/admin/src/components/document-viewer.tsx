"use client";

import { cn } from "@astax/ui";
import { useState } from "react";

export interface ViewerDocument {
  kind: string;
  label: string;
  files: { id: string; url: string; mime: string; label: string }[];
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2] as const;

/**
 * Dan, 2026-10-28: the documents large, one kind at a time, each file with
 * zoom and full screen. Only the file shown is loaded: every opening is
 * logged by the API (rule 4).
 */
export function DocumentViewer({
  documents,
  texts,
}: {
  documents: ViewerDocument[];
  texts: { zoomOut: string; zoomIn: string; fullScreen: string; none: string; preview: string };
}) {
  const [kind, setKind] = useState(0);
  const [file, setFile] = useState(0);
  const [zoom, setZoom] = useState(1);
  const current = documents[kind];
  const shown = current?.files[file] ?? current?.files[0];
  if (!current || !shown) return <p className="text-sm text-warm-600">{texts.none}</p>;
  const choose = (k: number) => {
    setKind(k);
    setFile(0);
    setZoom(1);
  };
  const tab = (active: boolean) =>
    cn(
      "min-h-11 rounded-xl px-4 text-sm font-semibold",
      active
        ? "border-2 border-night-900 bg-night-900 text-white"
        : "border border-night-100 bg-white text-night-800",
    );
  return (
    <div>
      <div role="tablist" aria-label={texts.preview} className="flex flex-wrap gap-2">
        {documents.map((d, i) => (
          <button
            key={d.kind}
            type="button"
            role="tab"
            aria-selected={i === kind}
            onClick={() => choose(i)}
            className={tab(i === kind)}
          >
            {d.label}
          </button>
        ))}
      </div>
      {current.files.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label={current.label}>
          {current.files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === shown.id}
              onClick={() => {
                setFile(i);
                setZoom(1);
              }}
              className={cn(
                "min-h-11 rounded-lg px-3 text-sm",
                f.id === shown.id ? "bg-night-100 font-semibold" : "border border-warm-200",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 h-[28rem] overflow-auto rounded-xl border border-warm-200 bg-warm-100">
        {shown.mime === "application/pdf" ? (
          <iframe
            key={shown.id}
            src={shown.url}
            title={`${current.label} · ${shown.label}`}
            className="h-full w-full bg-white"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          />
        ) : (
          // The file comes through our own route, which logs every opening.
          <img
            key={shown.id}
            src={shown.url}
            alt={`${current.label} · ${shown.label}`}
            className="max-w-none origin-top-left"
            style={{ width: `${zoom * 100}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={texts.zoomOut}
          disabled={zoom === ZOOMS[0]}
          onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom as never) - 1)] ?? 1)}
          className="min-h-11 min-w-11 rounded-lg border border-warm-200 bg-white text-lg disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          aria-label={texts.zoomIn}
          disabled={zoom === ZOOMS[ZOOMS.length - 1]}
          onClick={() =>
            setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom as never) + 1)] ?? 1)
          }
          className="min-h-11 min-w-11 rounded-lg border border-warm-200 bg-white text-lg disabled:opacity-40"
        >
          +
        </button>
        <a
          href={shown.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-lg border border-warm-200 bg-white px-3 text-sm font-medium"
        >
          {texts.fullScreen}
        </a>
      </div>
    </div>
  );
}

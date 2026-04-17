"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { TokenIconGlyph } from "@/components/TokenIconGlyph";
import type { TokenConfig } from "@/lib/txpark";

type Props = {
  label: string;
  tokens: TokenConfig[];
  value: string;
  onChange: (key: string) => void;
};

export function TokenSelectMenu({ label, tokens, value, onChange }: Props) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = tokens.find((t) => t.key === value) ?? (tokens.length > 0 ? tokens[0] : undefined);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-white/70">{label}</span>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#222222] px-3 py-3 text-left text-white outline-none ring-emerald-400/40 hover:border-white/20 focus-visible:ring-2"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
            {selected ? (
              <>
                <TokenIconGlyph tokenKey={selected.key} symbol={selected.symbol} address={selected.address} tone="dark" size="sm" />
                <span className="min-w-0 truncate">
                  <span className="font-medium">{selected.symbol}</span>
                  <span className="text-white/45"> — {selected.name}</span>
                </span>
              </>
            ) : (
              "—"
            )}
          </span>
          <Chevron className={`h-4 w-4 shrink-0 text-white/50 transition ${open ? "rotate-180" : ""}`} />
        </button>

        {open ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-activedescendant={selected ? `${uid}-opt-${selected.key}` : undefined}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(280px,50vh)] overflow-auto rounded-2xl border border-white/15 bg-[#1a1a1a] py-1 shadow-xl shadow-black/50"
          >
            {tokens.map((t) => {
              const active = t.key === value;
              return (
                <li key={t.address} role="presentation">
                  <button
                    id={`${uid}-opt-${t.key}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(t.key);
                      close();
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-white/10 ${
                      active ? "bg-white/10 text-white" : "text-white/85"
                    }`}
                  >
                    <TokenIconGlyph tokenKey={t.key} symbol={t.symbol} address={t.address} tone="dark" size="sm" />
                    <span className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="font-medium">{t.symbol}</span>
                      <span className="text-xs text-white/45">{t.name}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z" />
    </svg>
  );
}

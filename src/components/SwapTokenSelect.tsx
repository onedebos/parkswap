"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { TokenIconGlyph } from "@/components/TokenIconGlyph";
import type { TokenConfig } from "@/lib/txpark";

type Props = {
  valueKey: string;
  onChange: (key: string) => void;
  registry: TokenConfig[];
  featured: TokenConfig[];
  yourTokens: TokenConfig[];
  recentTokens: TokenConfig[];
  excludeKey: string | null;
  onImportClick: () => void;
  /** e.g. "Select token to sell" */
  ariaLabel: string;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <li role="presentation" className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
      {children}
    </li>
  );
}

/** Opens from the token pill (icon + symbol); lists Featured / Your / Recent + Import at bottom. */
export function SwapTokenSelect({
  valueKey,
  onChange,
  registry,
  featured,
  yourTokens,
  recentTokens,
  excludeKey,
  onImportClick,
  ariaLabel,
}: Props) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected =
    registry.find((t) => t.key === valueKey) ?? featured[0] ?? yourTokens[0] ?? recentTokens[0] ?? registry[0];

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

  const pick = (key: string) => {
    onChange(key);
    close();
  };

  const filterOut = (tokens: TokenConfig[]) =>
    excludeKey ? tokens.filter((t) => t.key !== excludeKey) : tokens;

  const feat = filterOut(featured);
  const yours = filterOut(yourTokens);
  const recent = filterOut(recentTokens);

  const renderOption = (t: TokenConfig) => {
    const active = t.key === valueKey;
    return (
      <li key={t.key} role="presentation">
        <button
          id={`${uid}-opt-${t.key}`}
          type="button"
          role="option"
          aria-selected={active}
          onClick={() => pick(t.key)}
          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-white/10 ${
            active ? "bg-white/10 text-white" : "text-white/85"
          }`}
        >
          <TokenIconGlyph tokenKey={t.key} symbol={t.symbol} address={t.address} tone="dark" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t.symbol}</span>
            <span className="block truncate text-xs text-white/45">{t.name}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-white px-2 py-2 pl-2 pr-3 text-sm font-semibold text-black shadow-lg outline-none ring-emerald-400/40 hover:bg-white/90 focus-visible:ring-2"
      >
        {selected ? (
          <>
            <TokenIconGlyph tokenKey={selected.key} symbol={selected.symbol} address={selected.address} tone="light" />
            <span className="max-w-24 truncate">{selected.symbol}</span>
            <Chevron className={`h-4 w-4 shrink-0 text-black/50 transition ${open ? "rotate-180" : ""}`} />
          </>
        ) : (
          <span>—</span>
        )}
      </button>

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 w-[min(calc(100vw-2rem),280px)] max-h-[min(320px,55vh)] overflow-auto rounded-2xl border border-white/15 bg-[#1a1a1a] py-1 shadow-xl shadow-black/50"
        >
          {feat.length ? (
            <>
              <SectionLabel>Featured</SectionLabel>
              {feat.map(renderOption)}
            </>
          ) : null}
          {yours.length ? (
            <>
              <SectionLabel>Your tokens</SectionLabel>
              {yours.map(renderOption)}
            </>
          ) : null}
          {recent.length ? (
            <>
              <SectionLabel>Recent</SectionLabel>
              {recent.map(renderOption)}
            </>
          ) : null}
          <li role="presentation" className="my-1 border-t border-white/10" />
          <li role="presentation">
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-emerald-300/95 hover:bg-white/10"
              onClick={() => {
                close();
                onImportClick();
              }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-white/25 text-lg leading-none text-white/60">
                +
              </span>
              <span>Import token</span>
            </button>
          </li>
        </ul>
      ) : null}
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

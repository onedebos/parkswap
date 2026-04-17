"use client";

import { useEffect, useMemo, useState } from "react";
import { cryptoIconMatchesNameSearch, cryptoIconTagHit } from "@/lib/cryptoicon-name-tags";
import { APP_BUNDLED_ICON_IDS, cryptoIconBundledLabel, cryptoIconSvgUrl } from "@/lib/cryptoicons";

type IndexResponse = { icons: string[]; truncated?: boolean };

export function CryptoIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iconBaseName: string) => void;
}) {
  const [icons, setIcons] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [indexTruncated, setIndexTruncated] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cryptoicons-index", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as IndexResponse & { error?: string };
        if (!res.ok) throw new Error(data.error || "Failed to load icons");
        if (!cancelled) {
          const fromApi = data.icons ?? [];
          const merged = new Set<string>(fromApi);
          for (const id of APP_BUNDLED_ICON_IDS) merged.add(id);
          setIcons([...merged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
          setIndexTruncated(Boolean(data.truncated));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load icon list");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bundledSet = useMemo(() => new Set<string>(APP_BUNDLED_ICON_IDS as readonly string[]), []);

  const matches = useMemo(() => {
    if (!icons) return [];
    const t = query.trim().toLowerCase();
    if (t.length < 2) return [];
    const hit: string[] = [];
    for (const id of icons) {
      if (cryptoIconMatchesNameSearch(id, t)) hit.push(id);
    }
    hit.sort((a, b) => {
      const aBundled = bundledSet.has(a) ? 0 : 1;
      const bBundled = bundledSet.has(b) ? 0 : 1;
      if (aBundled !== bBundled) return aBundled - bBundled;
      const aTag = cryptoIconTagHit(a, t) ? 0 : 1;
      const bTag = cryptoIconTagHit(b, t) ? 0 : 1;
      if (aTag !== bTag) return aTag - bTag;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    return hit.slice(0, 72);
  }, [icons, query, bundledSet]);

  const selectedUrl = value ? cryptoIconSvgUrl(value) : "";
  const selectedLabel = value ? cryptoIconBundledLabel(value) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or symbol (e.g. bitcoin, xtz) — min 2 letters"
        className="rounded-2xl border border-white/10 bg-[#222222] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
        spellCheck={false}
        autoComplete="off"
      />

      {loadError ? <p className="text-xs text-amber-200/90">{loadError}</p> : null}
      {!loadError && icons === null ? <p className="text-xs text-white/45">Loading icon list…</p> : null}
      {icons && !loadError && indexTruncated ? (
        <p className="text-[11px] text-amber-200/70">GitHub tree was truncated; list may be incomplete.</p>
      ) : null}

      {icons && query.trim().length > 0 && query.trim().length < 2 ? (
        <p className="text-xs text-white/45">Type at least 2 characters to search.</p>
      ) : null}

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#222222] px-3 py-2">
        {selectedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selectedUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white/10 object-contain p-1" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-xl bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-white/40">Selected</p>
          {selectedLabel ? (
            <div className="min-w-0" title={value || undefined}>
              <p className="truncate font-sans text-sm text-white/90">{selectedLabel}</p>
              <p className="truncate font-mono text-[11px] text-white/45">{value}</p>
            </div>
          ) : (
            <p className="truncate font-mono text-sm text-white/90" title={value || undefined}>
              {value || "—"}
            </p>
          )}
        </div>
      </div>

      {matches.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] text-white/40">
            {matches.length >= 72 ? "First 72 matches — narrow your search" : `${matches.length} match(es)`}
          </p>
          <div className="grid max-h-[280px] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
            {matches.map((id) => {
              const url = cryptoIconSvgUrl(id);
              const selected = value === id;
              const bundled = cryptoIconBundledLabel(id);
              return (
                <button
                  key={id}
                  type="button"
                  title={bundled ? `${bundled} — ${id}` : id}
                  aria-label={bundled ? `Select icon ${bundled}, ${id}` : `Select icon ${id}`}
                  onClick={() => onChange(id)}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition ${
                    selected ? "border-white bg-white/15" : "border-white/10 bg-white/5 hover:border-white/25"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-8 w-8 object-contain" loading="lazy" />
                  <span className="w-full truncate text-center text-[9px] text-white/55">
                    {bundled ? (
                      <span className="line-clamp-2 font-sans leading-tight">{bundled}</span>
                    ) : (
                      <span className="font-mono">{id}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {icons && query.trim().length >= 2 && matches.length === 0 ? (
        <p className="text-xs text-white/45">No icons match that search.</p>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { bundledAppIconUrlForToken } from "@/lib/cryptoicons";

function symbolInitials(symbol: string) {
  const s = symbol.trim().toUpperCase();
  if (s.length <= 2) return s;
  return s.slice(0, 2);
}

type Tone = "dark" | "light";
type Size = "sm" | "md" | "lg";

const imgBase = "shrink-0 rounded-full object-cover object-center";

function fallbackClasses(tone: Tone, size: Size) {
  const box =
    size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-10 w-10 text-xs" : "h-9 w-9 text-[11px]";
  const bg =
    tone === "dark"
      ? "bg-white/10 text-white"
      : "bg-black/10 text-black";
  return `flex ${box} shrink-0 items-center justify-center rounded-full font-bold ${bg}`;
}

type Props = {
  tokenKey: string;
  symbol: string;
  /** When set, icon can resolve from symbol / featured address even if `tokenKey` is an import address. */
  address?: string;
  /** Surface behind the glyph (affects initials fallback). */
  tone?: Tone;
  size?: Size;
  /** Extra classes on the `<img>`. */
  imgClassName?: string;
  /** Override initials wrapper classes. */
  fallbackClassName?: string;
};

/** Renders `/public/icons/{id}.svg` for USDC, VNXAU, xU3O8 (by key, symbol, or featured address); else initials. */
export function TokenIconGlyph({
  tokenKey,
  symbol,
  address,
  tone = "dark",
  size = "md",
  imgClassName = "",
  fallbackClassName,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = bundledAppIconUrlForToken({ key: tokenKey, symbol, address });
  const dim = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-9 w-9";

  if (url && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${imgBase} ${dim} ${imgClassName}`.trim()}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span className={fallbackClassName ?? fallbackClasses(tone, size)} aria-hidden>
      {symbolInitials(symbol)}
    </span>
  );
}

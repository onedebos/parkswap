import { FEATURED_TOKENS, sameAddress } from "@/lib/txpark";

/** Cryptofonts cryptoicons — SVG on `master`. */
export const CRYPTOFONTS_SVG_BASE =
  "https://raw.githubusercontent.com/Cryptofonts/cryptoicons/master/SVG";

/** Icons served from `/public/icons/{id}.svg` (bundled in the app). */
export const APP_BUNDLED_ICON_IDS = ["xu3o8", "vnxau", "usdc"] as const;

/** Human-readable names for bundled icons (picker / tooltips). */
export const APP_BUNDLED_ICON_LABELS: Record<string, string> = {
  xu3o8: "Uranium (xU3O8)",
  vnxau: "VNX Gold (VNXAU)",
  usdc: "USD Coin (USDC)",
};

export function cryptoIconBundledLabel(iconBaseName: string): string | undefined {
  const n = iconBaseName.replace(/\.svg$/i, "").trim().toLowerCase();
  return APP_BUNDLED_ICON_LABELS[n];
}

function isBundledIconId(id: string) {
  const n = id.toLowerCase();
  return (APP_BUNDLED_ICON_IDS as readonly string[]).includes(n);
}

export type BundledAppIconTokenInput = {
  key: string;
  symbol: string;
  address?: string;
};

/**
 * Maps a token row to a bundled `/public/icons/{id}.svg` id (`xu3o8`, `vnxau`, `usdc`)
 * using stable `key`, common symbols, or equality with featured contract addresses.
 */
export function bundledAppIconIdForToken(token: BundledAppIconTokenInput): string | null {
  const k = token.key.replace(/\.svg$/i, "").trim().toLowerCase();
  if (k && isBundledIconId(k)) return k;
  const sym = token.symbol.trim().toUpperCase();
  if (sym === "USDC") return "usdc";
  if (sym === "VNXAU") return "vnxau";
  if (sym === "XU3O8") return "xu3o8";
  const addr = token.address?.trim();
  if (addr) {
    if (sameAddress(addr, FEATURED_TOKENS.usdc.address)) return "usdc";
    if (sameAddress(addr, FEATURED_TOKENS.vnxau.address)) return "vnxau";
    if (sameAddress(addr, FEATURED_TOKENS.xu3o8.address)) return "xu3o8";
  }
  return null;
}

/** Local `/public/icons/{id}.svg` when the token is USDC, VNXAU, or xU3O8 (by key, symbol, or featured address). */
export function bundledAppIconUrlForToken(token: BundledAppIconTokenInput): string | null {
  const id = bundledAppIconIdForToken(token);
  return id ? `/icons/${encodeURIComponent(id)}.svg` : null;
}

/** Local `/public/icons/{key}.svg` for bundled ids only (`xu3o8`, `vnxau`, `usdc`). */
export function bundledAppIconUrlForTokenKey(tokenKey: string): string | null {
  return bundledAppIconUrlForToken({ key: tokenKey, symbol: "" });
}

/** `iconBaseName` is the file basename without `.svg` (e.g. `btc`, `xu3o8`). Bundled ids resolve under `/icons/`. */
export function cryptoIconSvgUrl(iconBaseName: string) {
  const name = iconBaseName.replace(/\.svg$/i, "").trim();
  if (!name) return "";
  if (isBundledIconId(name)) {
    return `/icons/${encodeURIComponent(name.toLowerCase())}.svg`;
  }
  return `${CRYPTOFONTS_SVG_BASE}/${encodeURIComponent(name)}.svg`;
}

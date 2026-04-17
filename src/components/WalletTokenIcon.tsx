"use client";

import { useState } from "react";
import { TokenIconGlyph } from "@/components/TokenIconGlyph";
import { bundledAppIconUrlForToken, cryptoIconSvgUrl } from "@/lib/cryptoicons";
import type { TokenConfig } from "@/lib/txpark";

type Props = {
  token: TokenConfig;
  /** Cryptofonts slug from Create Token (`cryptoIconSvgUrl`), when this row is a locally deployed token. */
  cryptoIconSlug?: string | null;
};

const slugImgClass =
  "h-10 w-10 shrink-0 rounded-full bg-white/10 object-cover object-center ring-1 ring-white/10";

/** Bundled app icons, then optional picker icon for deployed tokens, else initials. */
export function WalletTokenIcon({ token, cryptoIconSlug }: Props) {
  const [slugBroken, setSlugBroken] = useState(false);

  if (bundledAppIconUrlForToken(token)) {
    return <TokenIconGlyph tokenKey={token.key} symbol={token.symbol} address={token.address} tone="dark" size="lg" />;
  }

  const slug = cryptoIconSlug?.trim();
  if (slug && !slugBroken) {
    const src = cryptoIconSvgUrl(slug);
    if (src) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={slugImgClass} onError={() => setSlugBroken(true)} />
      );
    }
  }

  return <TokenIconGlyph tokenKey={token.key} symbol={token.symbol} address={token.address} tone="dark" size="lg" />;
}

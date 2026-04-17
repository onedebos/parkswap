import { sameAddress, type TokenConfig } from "@/lib/txpark";

/**
 * Uniswap v3 `sqrtPriceX96` is token1 per token0. Returns human units: how much `tokenOut` per 1 `tokenIn`.
 */
export function midAmountOutPerIn(
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  token0: TokenConfig,
  token1: TokenConfig,
  sqrtPriceX96: bigint,
): number | null {
  const inIsT0 = sameAddress(tokenIn.address, token0.address);
  const outIsT1 = sameAddress(tokenOut.address, token1.address);
  const inIsT1 = sameAddress(tokenIn.address, token1.address);
  const outIsT0 = sameAddress(tokenOut.address, token0.address);
  if (!((inIsT0 && outIsT1) || (inIsT1 && outIsT0))) return null;

  const q192 = 2n ** 192n;
  const ratioX192 = sqrtPriceX96 * sqrtPriceX96;
  const rawRatioScaled = Number((ratioX192 * 1_000_000_000_000n) / q192) / 1_000_000_000_000;
  const token1PerToken0 = rawRatioScaled * 10 ** (token0.decimals - token1.decimals);
  if (!Number.isFinite(token1PerToken0) || token1PerToken0 <= 0) return null;

  if (inIsT0 && outIsT1) return token1PerToken0;
  return 1 / token1PerToken0;
}

import { Token } from "@uniswap/sdk-core";
import { FeeAmount, Pool, Position, TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { formatUnits, parseUnits } from "ethers";
import { sameAddress, TXPARK_CHAIN_ID, type TokenConfig } from "@/lib/txpark";

/**
 * Synthetic pool for V3 deposit math only. Uses `FeeAmount.LOW` tick spacing (10) so the SDK accepts
 * our full-range ticks; mint amounts depend on sqrt price and tick bounds, not fee tier.
 */
function poolForDepositMath(token0: TokenConfig, token1: TokenConfig, sqrtPriceX96: bigint): Pool {
  const t0 = new Token(TXPARK_CHAIN_ID, token0.address, token0.decimals, token0.symbol, token0.name);
  const t1 = new Token(TXPARK_CHAIN_ID, token1.address, token1.decimals, token1.symbol, token1.name);
  const sqrt = JSBI.BigInt(sqrtPriceX96.toString());
  const tickCurrent = TickMath.getTickAtSqrtRatio(sqrt);
  return new Pool(t0, t1, FeeAmount.LOW, sqrt, "0", tickCurrent);
}

export function mintAmountsForFullRange(args: {
  token0: TokenConfig;
  token1: TokenConfig;
  sqrtPriceX96: bigint;
  tickLower: number;
  tickUpper: number;
  /** User-specified side and amount (wei). */
  primary: "token0" | "token1";
  primaryAmountWei: bigint;
}): { amount0: bigint; amount1: bigint } {
  const pool = poolForDepositMath(args.token0, args.token1, args.sqrtPriceX96);
  const pos =
    args.primary === "token0"
      ? Position.fromAmount0({
          pool,
          tickLower: args.tickLower,
          tickUpper: args.tickUpper,
          amount0: JSBI.BigInt(args.primaryAmountWei.toString()),
          useFullPrecision: true,
        })
      : Position.fromAmount1({
          pool,
          tickLower: args.tickLower,
          tickUpper: args.tickUpper,
          amount1: JSBI.BigInt(args.primaryAmountWei.toString()),
        });
  const { amount0, amount1 } = pos.mintAmounts;
  return { amount0: BigInt(amount0.toString()), amount1: BigInt(amount1.toString()) };
}

/** Human string for secondary field; trims trailing zeros. */
export function formatWeiTrimmed(wei: bigint, decimals: number): string {
  const s = formatUnits(wei, decimals);
  const t = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return t === "" ? "0" : t;
}

/** Other side’s human amount for full-range mint at `sqrtPriceX96`, given user typed `source` side. */
export function counterpartHumanFromPrimary(args: {
  source: "a" | "b";
  primaryAmountHuman: string;
  tokenA: TokenConfig;
  tokenB: TokenConfig;
  token0: TokenConfig;
  token1: TokenConfig;
  sqrtPriceX96: bigint;
  tickLower: number;
  tickUpper: number;
}): string {
  const primaryTok = args.source === "a" ? args.tokenA : args.tokenB;
  const otherTok = args.source === "a" ? args.tokenB : args.tokenA;
  const trimmed = args.primaryAmountHuman.trim();
  if (!trimmed) return "";
  let primaryWei: bigint;
  try {
    primaryWei = parseUnits(trimmed, primaryTok.decimals);
  } catch {
    return "";
  }
  if (primaryWei <= 0n) return "";
  const primary: "token0" | "token1" = tokenIsToken0(primaryTok, args.token0) ? "token0" : "token1";
  try {
    const { amount0, amount1 } = mintAmountsForFullRange({
      token0: args.token0,
      token1: args.token1,
      sqrtPriceX96: args.sqrtPriceX96,
      tickLower: args.tickLower,
      tickUpper: args.tickUpper,
      primary,
      primaryAmountWei: primaryWei,
    });
    const otherWei = tokenIsToken0(otherTok, args.token0) ? amount0 : amount1;
    return formatWeiTrimmed(otherWei, otherTok.decimals);
  } catch {
    return "";
  }
}

/** True if `token` is token0 in canonical ordering. */
export function tokenIsToken0(token: TokenConfig, token0: TokenConfig): boolean {
  return sameAddress(token.address, token0.address);
}

import { encodeSqrtRatioX96, TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { parseUnits } from "ethers";
import { sameAddress, sortTokenPair, type TokenConfig } from "@/lib/txpark";

/**
 * User specifies "1 tokenA = (this many) tokenB" as a decimal string.
 * Returns `sqrtPriceX96` for the canonical pool ordering (token0 < token1).
 */
export function sqrtPriceX96FromOneTokenAEqualsXTokenB(
  tokenA: TokenConfig,
  tokenB: TokenConfig,
  tokenBHumanPerOneTokenAString: string,
): bigint {
  if (sameAddress(tokenA.address, tokenB.address)) {
    throw new Error("Tokens must be different.");
  }

  const human = tokenBHumanPerOneTokenAString.trim();
  if (!human) {
    throw new Error("Enter the initial price (amount of token B for 1 token A).");
  }

  const bPerAHuman = parseUnits(human, tokenB.decimals);
  if (bPerAHuman <= 0n) {
    throw new Error("Initial price must be greater than zero.");
  }

  const [t0] = sortTokenPair(tokenA, tokenB);

  const oneA = 10n ** BigInt(tokenA.decimals);

  const sqrt = sameAddress(tokenA.address, t0.address)
    ? encodeSqrtRatioX96(JSBI.BigInt(bPerAHuman.toString()), JSBI.BigInt(oneA.toString()))
    : encodeSqrtRatioX96(JSBI.BigInt(oneA.toString()), JSBI.BigInt(bPerAHuman.toString()));

  const out = BigInt(sqrt.toString());
  const min = BigInt(TickMath.MIN_SQRT_RATIO.toString()) + 1n;
  const max = BigInt(TickMath.MAX_SQRT_RATIO.toString()) - 1n;
  if (out < min || out > max) {
    throw new Error("Initial price is out of range for a V3 pool. Try a less extreme ratio.");
  }

  return out;
}

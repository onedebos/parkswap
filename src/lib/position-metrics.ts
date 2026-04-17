import { CurrencyAmount, Token } from "@uniswap/sdk-core";
import { SqrtPriceMath, TickMath } from "@uniswap/v3-sdk";
import { Contract, JsonRpcProvider } from "ethers";
import JSBI from "jsbi";
import {
  FULL_RANGE_TICK_LOWER,
  FULL_RANGE_TICK_UPPER,
  TXPARK_CHAIN_ID,
  poolAbi,
  resolvePoolAddress,
  sameAddress,
  sortTokenPair,
  type TokenConfig,
} from "@/lib/txpark";
import { getPositionToken, type ParkswapLiquidityPosition } from "@/lib/user-positions";

const ZERO = JSBI.BigInt(0);

function sdkToken(addr: string, tokens: TokenConfig[]) {
  const metadata = tokens.find((token) => sameAddress(token.address, addr));
  if (!metadata) return null;
  return new Token(TXPARK_CHAIN_ID, metadata.address, metadata.decimals, metadata.symbol, metadata.name);
}

function positionTokenAmountsRaw(
  liquidity: bigint,
  tickLower: number,
  tickUpper: number,
  sqrtRatioX96: bigint,
  tickCurrent: number,
): { amount0: JSBI; amount1: JSBI } {
  const L = JSBI.BigInt(liquidity.toString());
  const sqrtP = JSBI.BigInt(sqrtRatioX96.toString());
  const sqrtLower = TickMath.getSqrtRatioAtTick(tickLower);
  const sqrtUpper = TickMath.getSqrtRatioAtTick(tickUpper);

  if (tickCurrent < tickLower) {
    return {
      amount0: SqrtPriceMath.getAmount0Delta(sqrtLower, sqrtUpper, L, false),
      amount1: ZERO,
    };
  }
  if (tickCurrent < tickUpper) {
    return {
      amount0: SqrtPriceMath.getAmount0Delta(sqrtP, sqrtUpper, L, false),
      amount1: SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtP, L, false),
    };
  }
  return {
    amount0: ZERO,
    amount1: SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtUpper, L, false),
  };
}

export type LiquidityPositionMetrics = {
  currentCompositionToken0: number;
  currentCompositionToken1: number;
  poolSharePercentApprox: number | null;
  isFullRange: boolean;
  isInRange: boolean;
  priceRangeLabel: string;
};

export type PoolSlot = {
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
};

export async function fetchPoolSlot(
  provider: JsonRpcProvider,
  tokenA: TokenConfig,
  tokenB: TokenConfig,
  fee: number,
): Promise<PoolSlot | null> {
  const poolAddress = await resolvePoolAddress(provider, tokenA.address, tokenB.address, fee);
  if (!poolAddress) {
    return null;
  }

  const pool = new Contract(poolAddress, poolAbi, provider);
  const [slot0, liq] = await Promise.all([pool.slot0(), pool.liquidity()]);
  return {
    sqrtPriceX96: slot0.sqrtPriceX96 as bigint,
    tick: Number(slot0.tick),
    liquidity: liq as bigint,
  };
}

export function computePositionMetrics(
  position: ParkswapLiquidityPosition,
  slot: PoolSlot,
  tokens: TokenConfig[],
): LiquidityPositionMetrics | null {
  const token0 = sdkToken(position.token0, tokens);
  const token1 = sdkToken(position.token1, tokens);
  if (!token0 || !token1) {
    return null;
  }

  const { amount0: a0, amount1: a1 } = positionTokenAmountsRaw(
    position.liquidity,
    position.tickLower,
    position.tickUpper,
    slot.sqrtPriceX96,
    slot.tick,
  );

  const ca0 = CurrencyAmount.fromRawAmount(token0, a0.toString());
  const ca1 = CurrencyAmount.fromRawAmount(token1, a1.toString());

  let poolSharePercentApprox: number | null = null;
  if (slot.liquidity > 0n && position.liquidity > 0n) {
    const ratio = (Number(position.liquidity) / Number(slot.liquidity)) * 100;
    if (Number.isFinite(ratio)) {
      poolSharePercentApprox = ratio;
    }
  }

  const isFullRange = position.tickLower === FULL_RANGE_TICK_LOWER && position.tickUpper === FULL_RANGE_TICK_UPPER;
  const priceRangeLabel = isFullRange ? "Full range" : "Custom range";
  const isInRange = isFullRange || (slot.tick >= position.tickLower && slot.tick < position.tickUpper);

  return {
    currentCompositionToken0: parseFloat(ca0.toExact()),
    currentCompositionToken1: parseFloat(ca1.toExact()),
    poolSharePercentApprox,
    isFullRange,
    isInRange,
    priceRangeLabel,
  };
}

export async function loadLiquidityPositionMetrics(
  provider: JsonRpcProvider,
  positions: ParkswapLiquidityPosition[],
  tokens: TokenConfig[],
): Promise<Map<string, LiquidityPositionMetrics | null>> {
  const out = new Map<string, LiquidityPositionMetrics | null>();
  const slotByPoolKey = new Map<string, PoolSlot | null>();

  await Promise.all(
    positions.map(async (position) => {
      const token0 = getPositionToken(position, tokens, "token0");
      const token1 = getPositionToken(position, tokens, "token1");
      if (!token0 || !token1) {
        return;
      }

      const [sorted0, sorted1] = sortTokenPair(token0, token1);
      const poolKey = `${sorted0.address.toLowerCase()}:${sorted1.address.toLowerCase()}:${position.fee}`;
      if (!slotByPoolKey.has(poolKey)) {
        slotByPoolKey.set(poolKey, await fetchPoolSlot(provider, token0, token1, position.fee));
      }
    }),
  );

  for (const position of positions) {
    const key = position.tokenId.toString();
    const token0 = getPositionToken(position, tokens, "token0");
    const token1 = getPositionToken(position, tokens, "token1");
    if (!token0 || !token1) {
      out.set(key, null);
      continue;
    }

    const [sorted0, sorted1] = sortTokenPair(token0, token1);
    const poolKey = `${sorted0.address.toLowerCase()}:${sorted1.address.toLowerCase()}:${position.fee}`;
    const slot = slotByPoolKey.get(poolKey) ?? null;
    if (!slot) {
      out.set(key, null);
      continue;
    }

    out.set(key, computePositionMetrics(position, slot, tokens));
  }

  return out;
}
